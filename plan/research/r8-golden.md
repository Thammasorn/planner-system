# R8 — Independent verification of `docs/reference/golden-fixtures.json`

Date: 2026-09-30 (Wed; Buddhist Era 2569) · Scope: pre-planning research (nothing inside `/Users/thammasorn.har/Desktop/plan-system` was created or modified)

**Inputs (read-only)**
- `docs/reference/golden-fixtures.json` (18,188 bytes)
- `SPEC.md` v3.0 (§5.1–§5.6 business rules, §6.5 query, §7.4 API, §8.2–§8.5 UI mocks, §10.4 bootstrap, §11.3 fixture table, §12 milestones, Appendix A.1/A.2)
- Excel source named in the JSON: `docs/reference/Workload_Planner_Aug-Dec_2026_v2.xlsx`, plus the older `Workload_Planner_Aug-Dec_2026.xlsx` (v1)
- `docs/reference/excel-workload-planner.md`, `docs/history/decisions-log.md`, `docs/history/design-spec-v2.1.md` (superseded; context only)

**Tools used:** Node v26.5.0 (ESM script, no dependencies), Python 3.9.6 + openpyxl 3.1.5 (Excel cross-check). Playwright 1.63.0 type definitions came from another research agent's scratch install (`scratchpad/r4-client-test/node_modules/playwright-core/types/types.d.ts`).

**Scratch artifacts** (folder `…/scratchpad/r8-golden/`):
| file | what |
|---|---|
| `verify-golden.mjs` | main verifier: recomputes everything using integer cd math, with no JS `Date` for plan dates. Writes `facts.json` |
| `verify-excel.py` | checks the JSON against the Excel v2 source and diffs Excel v1 against v2 |
| `rounding-probe.mjs` | exhaustive probe of display rounding (`toFixed` vs `Intl` vs integer half-up) |
| `run-final.txt`, `excel-run.txt` | full outputs (also copied into §7 of this report) |
| `facts.json` | machine-readable derived facts (matrices, masking lists, day-level values, badges, synthetic cases) |

Re-run:
```bash
cd r8-golden
node verify-golden.mjs          # 113 PASS, 2 FAIL (both are SPEC UI-mock inconsistencies, see §3.2)
python3 verify-excel.py         # 0 failures
node rounding-probe.mjs
```

Evidence labels used below: **[verified-exec]** means the script computed it and the result is in §7. **[verified-doc]** means it was read in SPEC, the JSON or an Excel formula (location given). **[likely]** means reasoned but not executed. **[uncertain]** means open or ambiguous.

---

## 0. Verdict (TL;DR)

1. **The golden JSON agrees with SPEC with no discrepancies.** 113 automated checks passed [verified-exec]:
   - **F1:** total **19500 cd** (195.00 days), committed **11625 cd** (116.25 days), **0 OVER / 0 RISK**.
   - **Per project:** all 5 projects' total/committed values match.
   - **`expected.F1.byUserWeek`:** **57/57** entries match on total, committed and capacity. The set of non-zero computed user×week cells is exactly those 57 keys.
   - **F2/F3/F4:** the overload lists match field by field (user, week, level, excessCd, cause, totalCd, committedCd, capacityCd).
   - **SPEC Appendix A.1:** users (6), clients (4), projects (5) and tasks (10, with every weekly value) match.
   - **SPEC §11.3:** every number in the text matches.
2. **The JSON faithfully reflects its Excel source.** It matches `Workload_Planner_Aug-Dec_2026_v2.xlsx` (sheets Setup and Plan): 10 rows, each fraction × 500 equals `allocationsCd`, certainty overrides and client columns are identical, and the row order equals the JSON task order. Excel v1 has identical fractions; v2 only adds certainty [verified-exec].
3. **Excel settles the "excess" semantics.** The Excel sheet `แจ้งเตือน Overload` defines **OVER excess = committed − capacity** and **"เสี่ยง"/RISK excess = total − capacity** (formula quoted in §1.3) [verified-doc]. The golden data cannot tell the two OVER definitions apart, because in every golden OVER cell committed equals total.
4. **SPEC has internal inconsistencies outside the JSON** (UI mocks and seed:demo). These are listed in §3.2: D1 (the §8.4 Jack mock), D2 (a Mobile milestone shown on Cindy's home in §8.2), and D3 (the A.2 "เตรียมคู่มือสาขา" subtask contradicts BR-31).
5. **The fixture arithmetic exposes spec gaps that affect the M6/M7/M9 tests** (§3.3). The most important one: WEEK→DAY conversion (BR-22), BR-24 SCALE and BR-25 can all produce **DAY values above 100 cd**, which BR-26 and the DDL check forbid. F2, F3 and F4 all hit this as soon as a user edits a day in the overloaded week.

---

## 1. Method

### 1.1 Rules as implemented in the verifier (mirrors what `src/domain/**` must do)
- **Units (BR-01):** integers only. JSON values are cd. SPEC day strings such as `"3.75"` are converted to cd with string math (`3*100 + 75`), not floats.
- **Dates (BR-04/05):** `'YYYY-MM-DD'` strings are converted to civil-day numbers with Howard Hinnant's `days_from_civil` / `civil_from_days`.
  - `isoWeekday = ((days+3) mod 7)+1`, `weekStart(d) = d − (isoWeekday−1)`, `weekRange(from,to)` returns the Mondays in `[from,to)`.
  - A self-test compares these helpers with JS `Date` (UTC) for every day from 2025-12-01 to 2028-01-31 [verified-exec].
- **Capacity (BR-10..13):** implemented exactly as the SPEC §5.2 `dayCapacityCd`.
  - schedule base (100) → 0 on a holiday → minus leave (100 for a full day, 50 for a half day) → not below 0.
  - Week capacity is the sum over 7 days. `standardWeekCd` is the schedule sum over 7 days (used by BR-41).
  - BR-13 deactivation is treated as capacity 0 from the deactivation date, inclusive (assumption).
  - All 7 rows of the SPEC §5.2 table reproduce (500/300/450/300/200/400/0) [verified-exec].
- **Certainty (BR-35..37):** `override ?? parent.override ?? grandparent.override ?? project.certainty`.
  - All golden tasks are depth 0, so in practice it is `override ?? project.certainty`.
  - `total` is every plan. `committed` is the plans whose effective certainty is CONFIRMED.
- **Overload (BR-40/41):**
  - Level: `committed > cap` gives OVER; else `total > cap` gives RISK; else OK.
  - Excess: OVER is `committed − cap`, RISK is `total − cap`.
  - Cause: with `lost = standard − cap`, `lost>0 && total>standard` gives BOTH; `lost>0` gives CAPACITY; otherwise WORKLOAD.
- **Colour (BR-45):** implemented with integer comparisons only: ratio ≥ 0.8 ⇔ `5*load ≥ 4*cap`.
- **Distribution (BR-21/21a):** the verifier uses an integer-exact largest-remainder method, with remainders compared as `(t*w) % sumW` and ties going to the earlier index. It is compared against the SPEC's float sample (§3.3 G11). BR-21a falls back to schedule weights when week capacity is 0.
- **Fixture setups:** each Fn is **F1 plus its own setup**, not cumulative. Evidence: every `expected.Fn.description` is literally `"F1 + " + json(setup)`, written with Python-style `json.dumps` spacing [verified-exec].

### 1.2 Data window
The window is the 18 Mondays from `2026-08-31` to `2026-12-28`. The last week runs to 2027-01-03, so the exclusive end is **`2027-01-04`**.
- `weekRange('2026-08-31','2027-01-04')` equals `weekStarts` [verified-exec].
- **Trap:** `weekRange('2026-08-31','2026-12-28')` returns only 17 weeks. A query written `week_start < '2026-12-28'` drops Mint's "Rollout สาขา" 250 cd in week 12-28. The totals then become 19250 / 11625, and POS becomes 4375 / 2750 [verified-exec arithmetic].

### 1.3 Excel evidence for the OVER/RISK excess [verified-doc]
Workbook `Workload_Planner_Aug-Dec_2026_v2.xlsx`, sheet `แจ้งเตือน Overload`, cell `B9`:
```
=IF($A9="","",IF('Workload รายคน'!B21>1,"OVER "&TEXT('Workload รายคน'!B21-1,"0.00"),IF('Workload รายคน'!B6>1,"เสี่ยง "&TEXT('Workload รายคน'!B6-1,"0.00"),"")))
```
- In sheet `Workload รายคน`, row 6 is *ฉาก A · ถ้าทำทุกอย่าง* (total): `B6 = SUMIFS(Plan!F, Plan!D, person)`.
- Row 21 is *ฉาก B · เฉพาะงานที่ยืนยันแล้ว* (committed): `B21 = SUMIFS(Plan!F, Plan!D, person, Plan!AA, "แน่นอน")`.
- So OVER excess = committed − 1.00 and RISK excess = total − 1.00. The web version generalises 1.00 to `capacity`.
- The workbook stores formulas only (`fullCalcOnLoad="1"`), so there are no cached values to compare.

---

## 2. Results

### 2.1 F1 totals and per project [verified-exec]
| | total cd | committed cd | SPEC §11.3 (days) |
|---|---:|---:|---|
| **All** | **19500** | **11625** | 195.00 / 116.25 ✔ |
| POS Upgrade (CONFIRMED; "Rollout สาขา" override TENTATIVE) | 4625 | 2750 | 46.25 / 27.50 ✔ |
| Data Warehouse (CONFIRMED) | 3000 | 3000 | 30.00 / 30.00 ✔ |
| Mobile App Revamp (CONFIRMED) | 5875 | 5875 | 58.75 / 58.75 ✔ |
| CRM Migration (TENTATIVE) | 2500 | 0 | 25.00 / 0 ✔ |
| Store Analytics Dashboard (TENTATIVE) | 3500 | 0 | 35.00 / 0 ✔ |

F1 overloads: none. Every user×week has capacity = standard = 500.

### 2.2 F1 user × week matrix (total cd; `T` means a tentative cell with committed 0) [verified-exec]
Every non-empty cell holds exactly **one** task. No user has two allocations in the same week, so **committed is always either 0 or equal to total**.

| week | Manager | Cindy | Ivy | Peter | Jack | Mint | team total | team committed |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 2026-08-31 | · | 500 | · | 250 | · | · | 750 | 750 |
| 2026-09-07 | · | 500 | · | 250 | 250 | · | 1000 | 1000 |
| 2026-09-14 | · | 375 | 250 | 375 | 250 | · | 1250 | 1250 |
| 2026-09-21 | · | 250 | 250 | 500 | 375 | · | 1375 | 1375 |
| **2026-09-28 ← this week** | · | 250 | 250 | 500 | 375 | 250 | 1625 | 1625 |
| 2026-10-05 | · | 250T | 125 | 500 | 500 | 500 | 1875 | 1625 |
| 2026-10-12 | · | 250T | 250T | 375 | 500 | 500 | 1875 | 1375 |
| 2026-10-19 | · | 375T | 250T | 250 | 500 | 500 | 1875 | 1250 |
| 2026-10-26 | · | 375T | 250T | · | 250 | 500 | 1375 | 750 |
| 2026-11-02 | · | 250T | 250T | 250T | · | 375 | 1125 | 375 |
| 2026-11-09 | · | · | · | 375T | 250T | 250 | 875 | 250 |
| 2026-11-16 | · | · | · | 500T | 250T | · | 750 | 0 |
| 2026-11-23 | · | · | · | 500T | 250T | · | 750 | 0 |
| 2026-11-30 | · | · | · | 375T | 250T | 250T | 875 | 0 |
| 2026-12-07 | · | · | · | 250T | · | 375T | 625 | 0 |
| 2026-12-14 | · | · | · | 250T | · | 500T | 750 | 0 |
| 2026-12-21 | · | · | · | · | · | 500T | 500 | 0 |
| 2026-12-28 | · | · | · | · | · | 250T | 250 | 0 |
| **sum total** | 0 | 3375 | 1875 | 5500 | 4000 | 4750 | **19500** | **11625** |
| **sum committed** | 0 | 1875 | 875 | 3000 | 3000 | 2875 | | |

Notes on `expected.F1.byUserWeek` [verified-exec]:
- It lists **only the 57 non-zero cells**. Absent cells mean `{totalCd:0, committedCd:0, capacityCd:500}` under F1.
- `Manager` has no entries.
- Tests should iterate the expected entries and also assert that every other user×week is 0.

### 2.3 F2 / F3 / F4 [verified-exec]
Each fixture is F1 plus its own setup.

| Fixture | setup | Resulting capacity changes (all others 500) | Overloads (all match JSON) |
|---|---|---|---|
| F2 | holiday **2026-10-23 (Fri)** "วันหยุดสมมติสำหรับทดสอบ" | **all 6 users** (incl. Manager) week 2026-10-19: **400** | **Jack 2026-10-19 OVER +100 CAPACITY** (500/500/400); **Mint 2026-10-19 OVER +100 CAPACITY** (500/500/400) |
| F3 | Peter full-day leave **2026-10-05 (Mon)–2026-10-06 (Tue)**, type ลาพักร้อน | Peter week 2026-10-05: **300** | **Peter 2026-10-05 OVER +200 CAPACITY** (500/500/300) |
| F4 | Cindy full-day leave **2026-10-12 (Mon)–2026-10-14 (Wed)**, type ลาพักร้อน | Cindy week 2026-10-12: **200** | **Cindy 2026-10-12 RISK +50 CAPACITY** (total 250, committed 0, cap 200) |

- Cause check (BR-41): standard 500 > cap in every case, and total ≤ standard, so the cause is CAPACITY and never BOTH.
- **§11.3's F4 row does not state a cause.** The JSON says CAPACITY, which agrees with BR-41.
- In F2, Cindy's 10-19 cell (375/400, ratio 0.94) is **not** an overload, but its BR-45 colour changes from yellow to green.
- In F2, Peter and Ivy at 10-19 are 250/400 (yellow).

### 2.4 SPEC Appendix A.1 and §11.3 [verified-exec]
The verifier parses A.1 with regular expressions: users (6 rows), `ทุกคนทำงาน จ–ศ = 1.00`, dev password `demo1234`, clients line, projects (5 rows) and the task table (10 rows, every `MM-DD: v` pair). It also parses §11.3 (F1 totals, the per-project line, F2/F3/F4 sentences). All values match the JSON and the recomputation. The fixture dates in §11.3 fall on the stated weekdays: 10-23 is a Friday, 10-05..06 are Mon–Tue, 10-12..14 are Mon–Wed.

Further checks:
- JSON `positions` equal the SPEC §10.4 bootstrap position list in the same order.
- The fixture leave type `ลาพักร้อน` is in the FR-902 seed list.

### 2.5 Excel cross-check [verified-exec]
- The Plan sheet week columns F..W map to 2026-08-31..2026-12-28, all Mondays. Rows 6..15 are the 10 data rows.
- Every `fraction × 500` equals the JSON `allocationsCd`.
- Override: E15 `อาจไม่ทำ` becomes TENTATIVE on "Rollout สาขา".
- Client column A matches `project.client`. JSON task order equals the Excel row order.
- Excel descriptions end with ` (ตัวอย่าง — ลบได้)`, which the JSON strips.
- Setup people are Cindy, Ivy, Peter, Jack, Mint. The JSON adds a `Manager` demo user that does not exist in Excel.
- Excel-rule overloads (fixed capacity 1.00): 0 OVER and 0 เสี่ยง. The maximum person-week is exactly 1.00 (500 cd).
- Sums: 39.00 / 23.25 fractions, i.e. 19500 / 11625 cd.

---

## 3. Discrepancies, ambiguities and gaps

### 3.1 Golden JSON vs SPEC: no discrepancies. Precision notes for test writers
| # | Note | Evidence |
|---|---|---|
| N1 | §11.3 F4 row omits the cause; JSON says `CAPACITY`, which agrees with BR-41 (lost 300 > 0, total 250 ≤ standard 500) | [verified-exec] |
| N2 | BR-40 does not define "excess". JSON and §11.3 are consistent with the Excel formulas (OVER = committed − cap, RISK = total − cap). **Golden cannot tell the OVER definition apart** (committed = total in every golden OVER), so a unit test must pin it. Example: F2 + 125 cd TENTATIVE extra for Jack 10-19 gives total 625, committed 500, cap 400, **OVER +100 BOTH**; the other definition would give +225. Record it in PROGRESS › Decisions. | [verified-doc] Excel + [verified-exec] |
| N3 | `byUserWeek` omits zero cells; Manager has no entries | [verified-exec] |
| N4 | The fixtures are independent, not cumulative. The description strings embed Python `json.dumps` output, so do not string-compare them in TS; parse them. | [verified-exec] |
| N5 | The JSON has **no members list, no leave types, no project colour/code, no charter pages**. The seed must derive membership (LEAD = `project.lead`; MEMBER = every assignee, per BR-60) and needs `leave_types` (bootstrap step 2) before applying F3/F4. `time_off.created_by` is NOT NULL, so choose an actor (e.g. the user themself). | [verified-doc] §6.2, §10.4 |
| N6 | The range end must be exclusive `2027-01-04`. Using `< 2026-12-28` loses 250 cd (totals 19250 / 11625; POS 4375 / 2750). | [verified-exec] |
| N7 | JSON task names = Excel descriptions minus ` (ตัวอย่าง — ลบได้)` | [verified-exec] |

### 3.2 SPEC-internal inconsistencies (UI mocks / seed:demo; not in the JSON)
| # | Where | Problem | Evidence | Impact |
|---|---|---|---|---|
| D1 | §8.4 day-expansion mock | Jack's row for "19 ต.ค." shows solid `1.0 1.0 1.0 1.0` plus a Friday holiday. With the Friday 10-23 holiday (the F2 state), Jack's 500-cd WEEK allocation derives to **125/125/125/125/0 cd** (displayed "1.3", dashed, and each day is OVER at day level). If the row were DAY resolution at 1.0 × 4, the week total would be 4.0, contradicting §8.5's "5/4🔴" for the same cell. Peter's mock row (`╌0.6` × 4, exact 63/63/62/62) **is** consistent. | [verified-exec] | Do not use the §8.4 Jack row as a test oracle |
| D2 | §8.2 home mock (viewer Cindy) | Shows "◆ 9 ต.ค. Design freeze · Mobile". Cindy is a member of POS and CRM only (golden memberships), so by §3.3 ("Milestone ของโปรเจคที่ไม่มีสิทธิ์ → ไม่แสดง") and FR-1101 ("ของโปรเจคที่ฉันเห็นได้") Cindy must **not** see it. Also, FR-1101 says the leave card is "ใครลาวันนี้ / สัปดาห์นี้" but the mock shows "สัปดาห์หน้า: Peter (5–6 ต.ค.)". | [verified-doc] SPEC lines 421, 1123–1124 + [verified-exec] membership | M10 e2e: Cindy's 14-day milestone card shows only *UAT sign-off (POS)* in seed:demo. Decide whether the leave card shows next week. |
| D3 | Appendix A.2 seed:demo | "Rollout สาขา" (assigned to Mint, 5 weeks of plan) gets subtask "เตรียมคู่มือสาขา", described as unassigned and showing "รอมอบหมาย". **BR-31 / FR-610** say adding a child to an assigned task **moves the assignee and plan to the new child**, so that child would belong to Mint. Seeding it exactly as written requires bypassing BR-31, which would leave an assignment on a non-leaf task. | [verified-doc] SPEC lines 301, 538, 1538 | M11: decide in PROGRESS › Decisions. The simplest consistent option is two children under "Rollout สาขา": one receives Mint and the plan, the other ("เตรียมคู่มือสาขา") stays unassigned. Both inherit TENTATIVE via BR-35, so totals are unchanged. |
| D4 | §8.3 / §8.5 / §8.1 mocks | The mocks mix fixture states:<br>• §8.3 footer "Capacity … 12.0" in the 19/10 column requires the F2 holiday (under F1 it is 15.0).<br>• §8.5 needs **F2+F3** (Jack `5/4🔴`, Peter `5/3🔴`, "รายการที่ล้น (3)").<br>• §8.1 sidebar "●2" matches F2 alone for viewer Cindy.<br>All other numbers in these mocks match the data exactly. | [verified-exec] | Illustrative only |
| D5 | `design-spec-v2.1.md` (superseded) | Its illustrative team-total row shows "12 ต.ค. 17.5"; the golden data gives 18.75. Its alerts (Cindy 31 ส.ค. OVER, Mint 5 ต.ค. RISK) do not exist in the golden data. | [verified-exec] | Ignore; SPEC wins |

### 3.3 Spec gaps surfaced by fixture arithmetic (need a PROGRESS › Decisions entry in the named milestone)
| # | Milestone | Gap | Concrete numbers |
|---|---|---|---|
| G1 | M7 | **BR-22 WEEK→DAY in an overloaded week writes DAY rows above 100 cd.** BR-26 (DAY ≤ 100) and the DDL `person_days <= 1` for DAY forbid this. The natural fix action (edit one day of an over-full week) fails. | F2 Jack/Mint 10-19: 125,125,125,125. F3 Peter 10-05: 0,0,167,167,166. F4 Cindy 10-12: 0,0,0,125,125 [verified-exec]. Options: (a) raise the DAY cap (BR-26 + DDL) to e.g. 700; (b) reject the conversion with a message; (c) clamp and spill (changes the week total, breaking the §5.3 invariant). |
| G2 | M7 | **BR-24 SCALE can exceed 100 per day** | Ivy 09-28 DAY [50,50,100,50,50] (=300) scaled to 400 gives [67,67,133,67,66]; scaled to 350 gives [59,58,117,58,58] [verified-exec] |
| G3 | M6 | **BR-25 / FR-612 with N greater than the capacity in the range** gives edge-week DAY values above 100 | Ivy 4 days over Wed 11-11..Fri 11-13 gives 134/133/133 [verified-exec] |
| G4 | M6 | FR-804 fraction unit: the denominator is unspecified (standard week, actual capacity, or a fixed 500). JSON conversion uses f × 500; `excel-workload-planner.md` says "f × weekCapacity". The fraction is undefined when cap = 0. | Jack F2 10-19: 1.25 (÷400) vs 1.00 (÷500). The AC-803 e2e should paste into weeks without holiday or leave. |
| G5 | M6 | Keys `f`/`h`: "full capacity of the cell" could mean total capacity or remaining capacity after other tasks. AC-802 cannot tell them apart (Peter has no other work in 10-05). | Decide and unit-test |
| G6 | M7/M9 | BR-41 cause at **day** zoom differs from week level: F2 Jack Mon–Thu are OVER +25 **WORKLOAD** per day, while the week is OVER +100 **CAPACITY** | [verified-exec] |
| G7 | M9 | BR-45 colours by the `load/cap` ratio, so **F4 Cindy 10-12 is RED in the "ทั้งหมด" view although its level is RISK** (250/200). In the committed view it is empty (0/200). Tests must assert the level icon/label (§8.9: "OVER มี 🔴"), not only the colour. | [verified-exec] |
| G8 | M9/M10 | It is unspecified whether the `manager` user appears as a /workload row and counts in team capacity. | F1 team utilisation 2026-09-28..10-19: 7250/12000 = **60.4%** with all 6 users; 7250/10000 = **72.5%** with the 5 workers only [verified-exec] |
| G9 | M9 | FR-1007 "4 สัปดาห์ข้างหน้า": it is unclear whether this includes the current week. | For every golden fixture both readings give the same badge count (§4.6) |
| G10 | M6 | §7.4 example `?from=2026-09-28&to=2026-12-28`: `to` inclusive or exclusive? If exclusive (like `weekRange` and §6.5), week 12-28 is dropped. | Decide and document |
| G11 | M6 | **The SPEC sample `distribute()` breaks ties with float fractions.** It is exact for weights in {0,50,100} (169,400 cases, 0 mismatches). With part-time weights (FR-207 allows any 0.01–1.00) it can violate "ties go to the earlier day": 346 of 300,000 random cases. | `distribute(50,[10,40,100])` gives float [3,13,34] vs exact [4,13,33]; `distribute(100,[25,75,100,100])` gives [8,25,34,33] vs [9,25,33,33] [verified-exec]. Use integer remainders `(t*w) % sumW`. |
| G12 | M6 | Display rounding: SPEC mocks imply **half-up** ("1.3" for 125, "6.3" for 625, "3.8" for 375). `(cd/100).toFixed(1)` mis-rounds **2,800 of the 70,001** values 0..70000 cd (e.g. 15 cd gives "0.1", 35 cd gives "0.3", 115 cd gives "1.1"). `Intl.NumberFormat` (`roundingMode: halfExpand`) matched integer half-up with 0 mismatches on Node 26.5 / ICU 78.3 (en-US and th-TH). | [verified-exec]. Recommend an integer formatter: `tenths = floor((cd+5)/10)`. |
| G13 | M1/M9 | BR-13 "ตั้งแต่วันที่ปิดใช้งาน": is the deactivation date inclusive? | Deactivating Cindy on 2026-09-30 (inclusive) makes week 09-28 capacity 200 (**OVER +50 CAPACITY**) and gives **RISK** in 10-05 (+250), 10-12 (+250), 10-19 (+375), 10-26 (+375), 11-02 (+250) [verified-exec]. AC-203 keeps the old plans visible, and they will show as overloads. |
| G14 | all | **Golden coverage gaps:** no nested tasks (BR-35 inheritance untested), no multi-assignee task, no DAY rows, no user-week with mixed committed (0 < committed < total), no WORKLOAD/BOTH causes, no half-day leave, no part-time schedule, no archived/completed/unassigned tasks, no cap = 0 week. | Synthetic unit cases in §4.8. A.2 demo adds multi-assignee + DAY ("Kickoff workshop") and one nested unassigned task. |

---

## 4. Useful concrete facts for unit tests and e2e

### 4.1 Time anchors
- **Today = 2026-09-30 (Wed).** This week is **2026-09-28** (index 4 of the 18 golden weeks: 4 weeks of history, 13 after). Next week is 2026-10-05; the previous week is 2026-09-21.
- /workload default of 12 weeks from this week: **2026-09-28..2026-12-14**. Golden weeks 12-21 and 12-28 (Mint Rollout 500, 250) start off-screen to the right.
- Home "ภาระของฉัน 8 สัปดาห์": **2026-09-28..2026-11-16**.
- FR-1007 window: 09-28, 10-05, 10-12, 10-19 (current-week-inclusive) or 10-05..10-26. The F2 (10-19), F3 (10-05) and F4 (10-12) cells fall inside both.
- `todayBangkok()` probes (UTC+7, no DST) [verified-exec]:
  - `2026-09-29T23:30:00Z` → `2026-09-30` (this is SPEC §11.1's "ตอน 23:30 UTC" case)
  - `2026-09-30T16:59:59Z` → `2026-09-30`
  - `2026-09-30T17:00:00Z` → `2026-10-01`
  - `2026-12-31T17:00:00Z` → `2027-01-01`
- Year crossing: `weekStart('2027-01-01') = weekStart('2027-01-03') = '2026-12-28'`, and `addDays('2026-12-28',7) = '2027-01-04'` [verified-exec].
- **E2E clock pinning [likely; recommendation]:** all golden data lies in 2026-08-31..2027-01-03. If CI runs later with a real clock, every "today"-anchored view (/home, /my, /workload, the grid's "วันนี้") shows none of it.
  - Add a test-only server override for `todayBangkok()`, e.g. env `E2E_TODAY=2026-09-30`, honoured only when `NODE_ENV !== 'production'`.
  - Use Playwright's `page.clock.setFixedTime('2026-09-30T10:00:00+07:00')` on the client. `page.clock.install/setFixedTime/setSystemTime` exist in Playwright 1.63.0: `playwright-core/types/types.d.ts` lines 20486–20575 [verified-doc].

### 4.2 Seed facts (`scripts/seed-golden.ts`, reading the JSON)
- **Row counts after seed:golden [verified-exec, derived]:**
  - users 6; positions 6 (JSON = §10.4 list, same order); work_schedules 30 (6 × Mon–Fri at 1.00)
  - clients 4; projects 5; **project_members 10** (5 LEAD + 5 MEMBER)
  - tasks 10 (all depth 0); task_assignments 10; **allocations 57** (all WEEK)
  - holidays 0; time_off 0; leave_types 4 (bootstrap)
  - If charters are created through the service (M4+), there are 5 charter pages.
- **Memberships:**
  - POS: Cindy (LEAD), Ivy, Mint
  - DW: Peter (LEAD)
  - Mobile: Jack (LEAD), Mint
  - CRM: Cindy (LEAD), Ivy
  - Store: Peter (LEAD), Jack
- **LEAD sets:** Cindy leads POS and CRM; Peter leads DW and Store; Jack leads Mobile. **Ivy and Mint lead nothing.**
- **Membership in M2 has to be seeded explicitly** (lead + assignees). BR-60 auto-membership needs tasks (M3) and allocations (M6), so seed-golden must grow with the schema, milestone by milestone [likely].
- Bootstrap interplay [likely]:
  - If the test environment sets `INITIAL_MANAGER_*` and bootstrap runs **before** seed-golden on an empty DB, an extra manager user appears. That adds a /workload row and 500 cd/week of team capacity.
  - Run seed-golden into a DB whose leave types and positions come from bootstrap steps 2–3 only.
  - The seed must refuse `NODE_ENV=production` (A.1).
- Conversion: store `numeric(4,2)` = cd/100 (e.g. 375 → `3.75`). Read back with `Math.round(parseFloat(v)*100)` (BR-02). Every golden value is a multiple of 125 cd, so it is exact.

### 4.3 Visibility and masking (M2, M9, §11.2) [verified-exec, derived from §3.2/§3.3]
**Projects and clients each user can open** (every other project URL returns 404):

| viewer | projects | clients | 404 projects |
|---|---|---|---|
| Manager | all 5 | Coral, Bluebird, Sunrise, Internal | — |
| Cindy | POS Upgrade, CRM Migration | Coral, Sunrise | DW, Mobile, Store |
| Ivy | POS Upgrade, CRM Migration | Coral, Sunrise | DW, Mobile, Store |
| Peter | Data Warehouse, Store Analytics Dashboard | Coral, Internal | POS, Mobile, CRM |
| Jack | Mobile App Revamp, Store Analytics Dashboard | Bluebird, Internal | POS, DW, CRM |
| Mint | POS Upgrade, Mobile App Revamp | Coral, Bluebird | DW, CRM, Store |

**Whose workload totals each viewer sees (§3.3):**
- Manager, Cindy, Peter and Jack see everyone. Cindy, Peter and Jack qualify because they are LEAD of at least one project.
- Ivy sees Cindy, Ivy and Mint.
- Mint sees Cindy, Ivy, Jack and Mint.
- **Pairs with no visibility at all** (expect 404 on `/people/<target>` and no /workload row): Ivy→Manager, Ivy→Peter, Ivy→Jack, Mint→Manager, Mint→Peter.

**Masked rows ("งานในโปรเจคอื่น")** that `/api/grid/person/<target>` must return, with the strings that must be absent from `JSON.stringify(res)`. Examples; the full list is in §7.1 and `facts.json › masking`:
- **Cindy → Peter:** everything is masked, 15 weeks from 08-31:250 to 12-14:250.
  - Must NOT contain: `Data Warehouse`, `ย้าย pipeline ขึ้น BigQuery`, `Store Analytics Dashboard`, `ทำ dashboard ผู้บริหาร`.
- **Ivy → Mint:** masked 09-28:250, 10-05..10-26:500, 11-02:375, 11-09:250. POS "Rollout สาขา" stays visible.
  - Must NOT contain: `Mobile App Revamp`, `พัฒนา front-end`.
- **Jack → Peter:** DW is masked (08-31..10-19). Store "ทำ dashboard ผู้บริหาร" is visible because Jack is a Store member.
- **Mint → Jack:** masked 11-09..11-30 (250 each).
  - Must NOT contain: `Store Analytics Dashboard`, `เก็บ requirement + สรุป`.
- **Seed:demo milestones to hide:**
  - For Cindy: DW "Pipeline พร้อมใช้งาน", Mobile "Design freeze" and "Beta release", Store "Dashboard v1 review".
  - For Ivy: the same set as Cindy.

### 4.4 Capacity numbers (M5) [verified-exec]
- **Standard capacity:** every golden user is Mon–Fri 100, so 500 per week; Sat/Sun have no schedule rows.
- **F2:** all 6 users at 400 in week 10-19; per-day cap is 100,100,100,100,0 (Friday is the holiday).
- **F3:** Peter at 300 in week 10-05; per-day cap is 0,0,100,100,100.
- **F4:** Cindy at 200 in week 10-12; per-day cap is 0,0,0,100,100.
- **FR-906 impact messages:**
  - F3: "Peter week 2026-10-05 capacity 5.00 → 3.00 d; new OVER +2.00 CAPACITY".
  - F4: "Cindy week 2026-10-12 capacity 5.00 → 2.00 d; new RISK +0.50 CAPACITY". Whether RISK counts as "overload ใหม่" is undecided.
- M5 e2e "ลาทับถูกปฏิเสธ": after F3, a new leave for Peter on any date in 10-05..10-06 must be rejected by the `exclude using gist` constraint.
- M5 e2e "import CSV วันหยุด": `date,name` → `2026-10-23,วันหยุดสมมติสำหรับทดสอบ` reproduces F2.
- **Warning:** importing a real 2026 holiday calendar into a golden DB changes F1. For example, 2026-10-13 (Tue) is a Thai public holiday in reality; that is general knowledge and was not verified here. As a holiday it would make Jack/Mint 10-12 500/400 = OVER. Keep the golden DB free of other holidays.

### 4.5 Planning grid (M6) [verified-exec]
**Per-task sums (grid "รวม" column, 1 decimal, half-up):**

| task | person | cd | shown |
|---|---|---:|---:|
| POS ปรับปรุงระบบ POS หน้าร้าน | Cindy | 1875 | 18.8 |
| POS ทำ UAT + คู่มือหน้าร้าน | Ivy | 875 | 8.8 |
| POS Rollout สาขา (TENTATIVE override) | Mint | 1875 | 18.8 |
| DW ย้าย pipeline ขึ้น BigQuery | Peter | 3000 | 30.0 |
| Mobile ออกแบบ flow ใหม่ | Jack | 3000 | 30.0 |
| Mobile พัฒนา front-end | Mint | 2875 | 28.8 |
| CRM ย้ายข้อมูลลูกค้า | Cindy | 1500 | 15.0 |
| CRM ตั้งค่า automation | Ivy | 1000 | 10.0 |
| Store ทำ dashboard ผู้บริหาร | Peter | 2500 | 25.0 |
| Store เก็บ requirement + สรุป | Jack | 1000 | 10.0 |

**Per-project weekly totals** (grid footer "ภาระรวม", this project only):

| project | weekly totals (cd) | footer capacity (F1) |
|---|---|---|
| POS | 08-31:500 · 09-07:500 · 09-14:625 · 09-21:500 · 09-28:500 · 10-05:125 · 11-30:250 · 12-07:375 · 12-14:500 · 12-21:500 · 12-28:250 | Cindy+Ivy+Mint = 1500 (15.0) |
| DW | 08-31:250 · 09-07:250 · 09-14:375 · 09-21:500 · 09-28:500 · 10-05:500 · 10-12:375 · 10-19:250 | 500 |
| Mobile | 09-07:250 · 09-14:250 · 09-21:375 · 09-28:625 · 10-05:1000 · 10-12:1000 · 10-19:1000 · 10-26:750 · 11-02:375 · 11-09:250 | 1000 |
| CRM | 10-05:250 · 10-12:500 · 10-19:625 · 10-26:625 · 11-02:500 | 1000 |
| Store | 11-02:250 · 11-09:625 · 11-16:750 · 11-23:750 · 11-30:625 · 12-07:250 · 12-14:250 | 1000 |

Under F2, the week-10-19 footer capacity is 3×400 = 1200 (12.0) for POS, as in the §8.3 mock.

**AC-802 (needs F3):**
- Cell: DW row "ย้าย pipeline ขึ้น BigQuery", Peter, week **2026-10-05**, before = 500 (5.0), which is OVER +200.
- **`f` writes 300 (3.0)** and **`h` writes 150 (1.5)**.
- After `f`: 300/300 = OK (green), and the F3 overload list becomes empty. DW total goes 3000 → 2800 and the grand total 19500/11625 → 19300/11425.
- Who can edit: Manager or Peter (LEAD of DW).
- Under F1 the same key writes 500. Under F2, Jack/Mint 10-19 write 400. Under F4, Cindy 10-12 writes 200.

**AC-801** (type `3` into 6 selected Cindy cells; each becomes 300 cd = "3.0"):

| option | grid / row / weeks | cell changes | side effects |
|---|---|---|---|
| **C (recommended, no side effects)** | CRM grid, Cindy row, weeks 10-05..11-09 | 250,250,375,375,250,0 → 300 × 6 | Task sum 1500 → 1800; Cindy's week totals are all 300 (OK) |
| A | POS grid, weeks 08-31..10-05 | 500,500,375,250,250,0 → 300 × 6 | Task sum 1875 → 1800; Cindy 10-05 becomes 550 = **RISK +50 WORKLOAD** (committed 300) |
| B (from this week) | POS grid, weeks 09-28..11-02 | → 300 × 6 | **5 RISK cells** for Cindy: 10-05 +50, 10-12 +50, 10-19 +175, 10-26 +175, 11-02 +50 |

**AC-803:**
- In fraction mode, paste values such as 0.5 / 1 / 0.75 / 0.25. In a normal 500-capacity week they give 250 / 500 / 375 / 125 cd, whichever denominator is chosen (G4).
- Use clean cells, i.e. user-weeks with no allocation in F1:
  - Cindy: 11-09..12-28
  - Ivy: 08-31, 09-07, 11-09..12-28
  - Peter: 10-26, 12-21, 12-28
  - Jack: 08-31, 11-02, 12-07..12-28
  - Mint: 08-31..09-21, 11-16, 11-23
  - Manager: all weeks

**AC-805:** for example, edit Cindy POS 08-31 / 09-07 / 09-14 from 500 / 500 / 375 to any three new values, then press `Cmd+Z` three times; the cells return to 500 / 500 / 375 in reverse order.

**Display:**
- 1 decimal with half-up rounding (see G12): 375 → "3.8", 125 → "1.3", 625 → "6.3", 1875 → "18.8".
- The tooltip shows 2 decimals exactly (`3.75`).
- Zero shows as empty.

### 4.6 Workload and overload (M9) [verified-exec]
**Overload cells by fixture (week level):**
- F1: none.
- F2: Jack 10-19 OVER +100 CAPACITY; Mint 10-19 OVER +100 CAPACITY.
- F3: Peter 10-05 OVER +200 CAPACITY.
- F4: Cindy 10-12 RISK +50 CAPACITY.
- F2+F3 (the §8.5 state): 3 items.
- F2+F3+F4: 4 items (Peter 10-05 OVER, Cindy 10-12 RISK, Jack 10-19 OVER, Mint 10-19 OVER).

**BR-45 colour counts** over 108 cells (6 users × 18 weeks, including Manager's 18 empty cells):

| fixture | "ทั้งหมด" view (total) | "แน่นอน" view (committed) | RED cells | colour changes vs F1 |
|---|---|---|---|---|
| F1 | EMPTY 51, GREEN 16, YELLOW 41 | EMPTY 76, GREEN 12, YELLOW 20 | none | — |
| F2 | GREEN 15, YELLOW 40, RED 2 | — | Jack 10-19, Mint 10-19 | Cindy 10-19 yellow → green (375/400) |
| F3 | RED 1 | — | Peter 10-05 | — |
| F4 | RED 1 | committed view has no red (0/200) | Cindy 10-12 (a RISK cell) | — |

- F1 GREEN cells are exactly the total = 500 cells: Cindy 08-31 and 09-07; Peter 09-21, 09-28, 10-05, 11-16 and 11-23; Jack 10-05..10-19; Mint 10-05..10-26, 12-14 and 12-21.

**FR-1007 badge (OVER cells in 4 weeks visible to the viewer):**

| fixture | Manager | Cindy | Ivy | Peter | Jack | Mint |
|---|---:|---:|---:|---:|---:|---:|
| F1 | 0 | 0 | 0 | 0 | 0 | 0 |
| F2 | 2 | 2 | 1 | 2 | 2 | 2 |
| F3 | 1 | 1 | 0 | 1 | 1 | 0 |
| F4 (RISK only) | 0 | 0 | 0 | 0 | 0 | 0 |
| F2+F3 | 3 | 3 | 1 | 3 | 3 | 2 |
| seed:demo | 1 | 1 | 0 | 1 | 1 | 0 |

**Manager home "ล้นสัปดาห์นี้และสัปดาห์หน้า"** (weeks 09-28 and 10-05): F3 and seed:demo show Peter 10-05 OVER; F1, F2 and F4 show nobody.

**Team utilisation, 4 weeks (09-28..10-19)** — see G8:

| fixture | all 6 users | 5 workers only | committed (6 users / 5 workers) |
|---|---:|---:|---:|
| F1 | 60.4% | 72.5% | 49.0% / 58.8% |
| F2 | 63.6% | 76.3% | — |
| F3 | 61.4% | 74.0% | — |
| F4 | 62.0% | 74.7% | — |

**Hover/tooltip example (F3, Peter 10-05):** total 5.00, committed 5.00, atRisk 0.00, capacity 3.00 (standard 5.00 − leave 2.00), OVER +2.00 CAPACITY.

### 4.7 Day zoom (M7) [verified-exec]
Derived values (BR-21, largest remainder, ties to the earlier day):

| case | week | Mon | Tue | Wed | Thu | Fri | notes |
|---|---|---|---|---|---|---|---|
| Ivy (F1 and F2) | **09-28** | 50 | 50 | 50 | 50 | 50 | Shown as "0.5" dashed; this is the AC-804 week |
| Ivy under F1 | 10-19 | 50 | 50 | 50 | 50 | 50 | |
| Peter under F1 | 10-12 | 75 | 75 | 75 | 75 | 75 | Shown as "0.8" |
| F2 Peter | 10-19 | 63 | 63 | 62 | 62 | 0 | "0.6"; matches §8.4 |
| F2 Ivy | 10-19 | 63 | 63 | 62 | 62 | 0 | |
| F2 Cindy | 10-19 | 94 | 94 | 94 | 93 | 0 | |
| F2 Jack / Mint | 10-19 | 125 | 125 | 125 | 125 | 0 | "1.3"; each day OVER +25 **WORKLOAD** at day level |
| F3 Peter | 10-05 | 0 | 0 | 167 | 167 | 166 | Days with values are OVER +67/+67/+66 WORKLOAD |
| F4 Cindy | 10-12 | 0 | 0 | 0 | 125 | 125 | Days with values are RISK +25 WORKLOAD |

**AC-804:** expand Ivy week **2026-09-28** (POS "ทำ UAT + คู่มือหน้าร้าน", 250 WEEK). It shows 0.5 × 5 dashed.
- Set Wed **2026-09-30** (today) to 1.0.
- DAY rows become 09-28:50, 09-29:50, 09-30:100, 10-01:50, 10-02:50, so the week is **300 (3.0)**.
- The other days become real values (solid). Sat/Sun are not written.
- **Do not use 10-19 under F2** for this AC: the derived values there are 63/63/62/62/0, and the result would be 288 (2.9).

**BR-23 (collapse):** Ivy 09-28 DAY [50,50,100,50,50] collapses to WEEK 300; the total is unchanged.

**BR-24 dialog:** SCALE of the above to 200 gives [34,33,67,33,33]. Scaling to 350 or 400 exceeds 100 per day (G2). COLLAPSE gives WEEK = the new total.

**BR-25 / FR-612 examples** (Ivy has 0 load in 11-09..11-23):
| request | result |
|---|---|
| Ivy 10 days, 2026-11-11..2026-11-24 | DAY 11-11:100, 11-12:100, 11-13:100 · WEEK 11-16 = 500 · DAY 11-23:100, 11-24:100 |
| Ivy 5 days, same range | DAY 50,50,50 · WEEK 250 · DAY 50,50 |
| Ivy 2 days, 11-11..11-13 | DAY 67 / 67 / 66 (remainder goes to the earlier days) |
| Ivy 4 days, 11-11..11-13 | 134 / 133 / 133 — ⚠ violates DAY ≤ 100 (G3) |

### 4.8 Synthetic cause cases for `overload.ts` unit tests (golden never produces these) [verified-exec]
| case | total | committed | cap | standard | result |
|---|---:|---:|---:|---:|---|
| F1 + 125 cd CONFIRMED for Jack 10-05 | 625 | 625 | 500 | 500 | **OVER +125 WORKLOAD** |
| F1 + 250 cd TENTATIVE for Cindy 10-19 | 625 | 0 | 500 | 500 | **RISK +125 WORKLOAD** |
| F2 + 125 cd TENTATIVE for Jack 10-19 | 625 | 500 | 400 | 500 | **OVER +100 BOTH** (the total-based excess would wrongly be 225) |
| F4 + 300 cd TENTATIVE for Cindy 10-12 | 550 | 0 | 200 | 500 | **RISK +350 BOTH** |
| F2, Jack 10-19 reduced to 400 (key `f`) | 400 | 400 | 400 | 500 | **OK** (boundary `load = cap`) |

### 4.9 Milestones (M8) — A.2 demo, today 2026-09-30 [verified-exec]
| milestone | date | grid week | BR-70 status | notes |
|---|---|---|---|---|
| POS › UAT sign-off | 10-02 (Fri) | 09-28 | +2 days → **DUE_SOON** | Bound to "ทำ UAT + คู่มือหน้าร้าน", which has plan in week 10-05 > 10-02, so **BR-71 late ⚠** (matches §8.2 ⚠) |
| Mobile › Design freeze | 10-09 (Fri) | 10-05 | +9 days → UPCOMING | ≤ 7 would be DUE_SOON; it is inside the 14-day home window |
| DW › Pipeline พร้อมใช้งาน | 10-23 (Fri) | 10-19 | +23 → UPCOMING | |
| CRM › Data migration complete | 11-06 (Fri) | 11-02 | +37 → UPCOMING | |
| Mobile › Beta release | 11-13 (Fri) | 11-09 | +44 → UPCOMING | |
| Store › Dashboard v1 review | 12-11 (Fri) | 12-07 | +72 → UPCOMING | |
| POS › Go-live สาขาแรก | 12-21 (Mon) | 12-21 | +82 → UPCOMING | |

- **AC-701:** a milestone on 2026-10-23 (Fri) sits in column week 10-19, and in the day zoom on Friday the 23rd. That day is the F2 holiday if F2 is applied.
- **AC-702 candidates** (tasks with plan in week 10-26, so week_start 10-26 > a 10-23 milestone):
  - "ออกแบบ flow ใหม่" (Mobile, Jack 250)
  - "พัฒนา front-end" (Mobile, Mint 500)
  - "ย้ายข้อมูลลูกค้า" (CRM, Cindy 375)
  - "ตั้งค่า automation" (CRM, Ivy 250)
- DW "ย้าย pipeline" ends in week 10-19, so it is **not** late for a 10-23 milestone.

### 4.10 Home and "my work" (M10), F1, today 2026-09-30 [verified-exec]
**"งานของฉันสัปดาห์นี้"** (week 09-28):
- Cindy: ปรับปรุงระบบ POS หน้าร้าน 2.50 d
- Ivy: ทำ UAT + คู่มือหน้าร้าน 2.50
- Peter: ย้าย pipeline ขึ้น BigQuery 5.00
- Jack: ออกแบบ flow ใหม่ 3.75
- Mint: พัฒนา front-end 2.50
- Manager: none

**/my next week or later:**
- Cindy: ย้ายข้อมูลลูกค้า (next week)
- Ivy: ตั้งค่า automation (later, from 10-12)
- Peter: ทำ dashboard ผู้บริหาร (later, from 11-02)
- Jack: เก็บ requirement + สรุป (later, from 11-09)
- Mint: Rollout สาขา (later, from 11-30)
- No golden task is past-only or unplanned (the demo subtask "เตรียมคู่มือสาขา" is unassigned).

**"ภาระของฉัน 8 สัปดาห์"** (09-28..11-16):

| user | cd per week |
|---|---|
| Cindy | 250, 250, 250, 375, 375, 250, 0, 0 (matches the §8.2 bars) |
| Ivy | 250, 125, 250, 250, 250, 250, 0, 0 |
| Peter | 500, 500, 375, 250, 0, 250, 375, 500 |
| Jack | 375, 500, 500, 500, 250, 0, 250, 250 |
| Mint | 250, 500, 500, 500, 500, 375, 250, 0 |

### 4.11 seed:demo (M11) [verified-exec]
- Golden plus "Kickoff workshop" (Mobile; Jack and Mint each 50 cd as DAY on 2026-09-07) plus Peter leave 10-05..06:
  - total **19600**, committed **11725**; Mobile 5875 → 5975
  - Jack 09-07 = 300; Mint 09-07 = 50
  - overloads: **Peter 10-05 OVER +200 CAPACITY** only
- This is the first data with multi-assignee, DAY rows and a nested task. See D3 for the nested-task conflict.

---

## 5. Suggested test skeletons

```ts
// tests/golden/golden.domain.test.ts — pure domain, no DB (runs in `pnpm check`)
import golden from '../../docs/reference/golden-fixtures.json' // tsconfig: "resolveJsonModule": true
import { weekRange } from '@/domain/dates'
import { weekCapacityCd } from '@/domain/capacity'
import { effectiveCertainty } from '@/domain/certainty'
import { overloadStatus } from '@/domain/overload'

const WEEKS = weekRange('2026-08-31', '2027-01-04')           // NOT '2026-12-28' (17 weeks)
it('weeks', () => expect(WEEKS).toEqual(golden.weekStarts))

// expected cell accessor: absent in byUserWeek ⇒ 0 / 0 / 500 (F1)
const exp = (nick: string, ws: string) =>
  (golden.expected.F1.byUserWeek as Record<string, Record<string, {totalCd:number;committedCd:number;capacityCd:number}>>)[nick]?.[ws]
  ?? { totalCd: 0, committedCd: 0, capacityCd: 500 }

// overload lists: compare order-independently, sorted by (week, user)
const sortOv = <T extends { week: string; user: string }>(a: T[]) =>
  [...a].sort((x, y) => x.week.localeCompare(y.week) || x.user.localeCompare(y.user))
```

- DB-level golden (M6 grid, M9 workload): run `seed:golden` into a fresh test DB, apply `expected.Fn.setup` through the same services the UI uses (holiday create, time-off create), then call the repository and service behind `/api/workload` for `[2026-08-31, 2027-01-04)` and compare against `exp()` / `sortOv(expected.Fn.overloads)`.
- Tear down or recreate the DB per fixture, since F2–F4 are independent.
- Masking test (§11.2): for each `facts.masking` item, log in as the viewer, GET `/api/grid/person/<target>?from=2026-08-31&to=2027-01-04`, and assert `JSON.stringify(res).includes(s) === false` for every string in `mustNotContain`. Assert that the masked totals equal `byWeek`.

---

## 6. Summary of confidence

| claim | label |
|---|---|
| JSON = SPEC §11.3 = Appendix A.1 = BR rules (all numbers) | verified-exec |
| JSON = Excel v2 source; v1 has the same fractions | verified-exec |
| OVER excess = committed − cap, RISK excess = total − cap | verified-doc (Excel formulas) + consistent with JSON |
| D1, D2 mock inconsistencies; D3 BR-31 conflict | verified-exec / verified-doc |
| G1–G3 DAY > 100 overflow cases | verified-exec (arithmetic) |
| G11 float tie-break mismatch; G12 toFixed mis-rounding; Intl halfExpand OK on Node 26.5 / ICU 78.3 | verified-exec |
| Playwright `page.clock.setFixedTime` exists (1.63.0) | verified-doc (types.d.ts) |
| Clock-pinning approach, seed ordering and bootstrap interplay | likely (recommendations) |
| BR-13 inclusive deactivation date; manager user counted in the team; FR-1007 window; `f` = total vs remaining capacity; fraction denominator | uncertain (spec silent; decide in PROGRESS › Decisions) |

---

## 7. Appendix — full outputs and script sources

### 7.1 `node verify-golden.mjs` — full output (run-final.txt)

````text

## 0. Self-tests of the helper functions used by this script
  PASS  civil-day date helpers agree with JS Date(UTC) for every day 2025-12-01..2028-01-31
  PASS  weekStart crosses the year: 2027-01-01/03 -> 2026-12-28; 2027-01-04 -> 2027-01-04; addDays('2026-12-28',7) = 2027-01-04
  PASS  SPEC §5.2 case "ปกติ" -> 500 (expected 500)
  PASS  SPEC §5.2 case "ลา 2 วัน" -> 300 (expected 300)
  PASS  SPEC §5.2 case "ลาครึ่งวันบ่ายวันศุกร์" -> 450 (expected 450)
  PASS  SPEC §5.2 case "พาร์ตไทม์ จ/พ/ศ" -> 300 (expected 300)
  PASS  SPEC §5.2 case "พาร์ตไทม์ จ/พ/ศ + ลาวันพุธ" -> 200 (expected 200)
  PASS  SPEC §5.2 case "วันหยุดวันศุกร์ + ลาวันศุกร์" -> 400 (expected 400)
  PASS  SPEC §5.2 case "ลาทั้งสัปดาห์" -> 0 (expected 0)

## 0b. Alignment with SPEC §10.4 bootstrap / FR-902, and todayBangkok() instants
  PASS  JSON positions [Project Manager,Developer,Designer,QA,Data,Business Analyst] == §10.4 bootstrap positions (same order)
  PASS  leave type(s) used by fixtures [ลาพักร้อน] ⊂ FR-902 seed [ลาพักร้อน,ลาป่วย,ลากิจ,อบรม/สัมมนา] → leave_types must exist before applying F3/F4 (bootstrap step 2)
  PASS  todayBangkok at 2026-09-29T23:30:00Z = 2026-09-30 (expected 2026-09-30; Bangkok = UTC+7, no DST)
  PASS  todayBangkok at 2026-09-30T16:59:59Z = 2026-09-30 (expected 2026-09-30; Bangkok = UTC+7, no DST)
  PASS  todayBangkok at 2026-09-30T17:00:00Z = 2026-10-01 (expected 2026-10-01; Bangkok = UTC+7, no DST)
  PASS  todayBangkok at 2026-12-31T17:00:00Z = 2027-01-01 (expected 2027-01-01; Bangkok = UTC+7, no DST)

## 1. Structural checks of golden-fixtures.json
  PASS  weekStarts has 18 entries (18)
  PASS  weekStarts spans 2026-08-31..2026-12-28
  PASS  every weekStart is a Monday
  PASS  weekStarts are consecutive (7-day steps)
  PASS  weekRange('2026-08-31','2027-01-04') == weekStarts (note: exclusive end must be 2027-01-04, not 2026-12-28)
  PASS  weekRange('2026-08-31','2026-12-28') has only 17 weeks (drops 2026-12-28) — off-by-one trap
  PASS  users: 6 unique nicknames
  PASS  every user schedule = Mon..Fri 100 cd (no Sat/Sun rows)
  PASS  every user.position is in positions[]
  PASS  every project.client is in clients[]
  PASS  every project.lead is a user
  PASS  every task.project / task.assignee resolves
  PASS  every task granularity = WEEK
  PASS  every allocation key is one of weekStarts (Monday)
  PASS  every allocation value is an integer 0 < v <= 700 (BR-26 WEEK)
  PASS  every allocation value is a multiple of 25 cd (BR-27 0.25-day grid)
  PASS  every allocation value is a multiple of 125 cd (= Excel fraction 0.25 x 500)
  PASS  number of (task, week) allocation rows = 57 (expected 57)
  PASS  no user has two allocations in the same week (every user-week has at most ONE task) → committed is always 0 or = total
  PASS  exactly one certainty override: "Rollout สาขา" = TENTATIVE (in a CONFIRMED project)
  PASS  F2.description == "F1 + <F2.setup as JSON>" → fixtures are independent (each is F1 + its own setup, NOT cumulative)
  PASS  F3.description == "F1 + <F3.setup as JSON>" → fixtures are independent (each is F1 + its own setup, NOT cumulative)
  PASS  F4.description == "F1 + <F4.setup as JSON>" → fixtures are independent (each is F1 + its own setup, NOT cumulative)

## 2. F1 (no holidays, no leave) — totals, per project, per user×week
  PASS  F1 total 19500 cd (195.00 d) == expected 19500
  PASS  F1 committed 11625 cd (116.25 d) == expected 11625
  PASS  byProject POS Upgrade: computed 4625/2750 vs expected 4625/2750
  PASS  byProject Data Warehouse: computed 3000/3000 vs expected 3000/3000
  PASS  byProject Mobile App Revamp: computed 5875/5875 vs expected 5875/5875
  PASS  byProject CRM Migration: computed 2500/0 vs expected 2500/0
  PASS  byProject Store Analytics Dashboard: computed 3500/0 vs expected 3500/0
  PASS  expected.F1.byProject has exactly the 5 projects
  PASS  expected.F1.byUserWeek: 57/57 entries match (total, committed, capacity)
  PASS  every computed non-zero user×week (57) is present in expected.F1.byUserWeek (57); missing: none
  PASS  expected.F1.byUserWeek lists only non-zero cells (zero-load weeks are omitted → tests must treat absent = 0/0/500)
  PASS  Manager has no entries in byUserWeek (no allocations; capacity 500 every week)
  PASS  F1 overloads: computed 0, expected 0 (OVER 0, RISK 0)
  PASS  F1: every user×week capacity = standard = 500 cd

## 3. F2 / F3 / F4 overload lists (level, excessCd, cause, total, committed, capacity)
  PASS  F2: computed overloads == expected (2 item(s))
        F2 Jack 2026-10-19 OVER excess 100 (1.00 d) cause CAPACITY total 500 committed 500 cap 400
        F2 Mint 2026-10-19 OVER excess 100 (1.00 d) cause CAPACITY total 500 committed 500 cap 400
        F2 capacity cells != 500: Manager 2026-10-19 cap 400 · Cindy 2026-10-19 cap 400 · Ivy 2026-10-19 cap 400 · Peter 2026-10-19 cap 400 · Jack 2026-10-19 cap 400 · Mint 2026-10-19 cap 400
  PASS  F3: computed overloads == expected (1 item(s))
        F3 Peter 2026-10-05 OVER excess 200 (2.00 d) cause CAPACITY total 500 committed 500 cap 300
        F3 capacity cells != 500: Peter 2026-10-05 cap 300
  PASS  F4: computed overloads == expected (1 item(s))
        F4 Cindy 2026-10-12 RISK excess 50 (0.50 d) cause CAPACITY total 250 committed 0 cap 200
        F4 capacity cells != 500: Cindy 2026-10-12 cap 200

## 4. SPEC Appendix A.1 tables vs JSON
  PASS  A.1 users table parsed: 6 rows
  PASS  A.1 user Manager: manager@example.com / Project Manager / manager matches JSON
  PASS  A.1 user Cindy: cindy@example.com / Project Manager / worker matches JSON
  PASS  A.1 user Ivy: ivy@example.com / QA / worker matches JSON
  PASS  A.1 user Peter: peter@example.com / Data / worker matches JSON
  PASS  A.1 user Jack: jack@example.com / Designer / worker matches JSON
  PASS  A.1 user Mint: mint@example.com / Developer / worker matches JSON
  PASS  A.1 "ทุกคนทำงาน จ–ศ = 1.00" ↔ JSON scheduleCd {1..5: 100}
  PASS  A.1 dev password demo1234 ↔ JSON devPassword
  PASS  A.1 clients [Coral,Bluebird,Sunrise,Internal] == JSON clients
  PASS  A.1 projects table parsed: 5 rows
  PASS  A.1 project POS Upgrade: Coral / CONFIRMED / lead Cindy matches JSON
  PASS  A.1 project Data Warehouse: Coral / CONFIRMED / lead Peter matches JSON
  PASS  A.1 project Mobile App Revamp: Bluebird / CONFIRMED / lead Jack matches JSON
  PASS  A.1 project CRM Migration: Sunrise / TENTATIVE / lead Cindy matches JSON
  PASS  A.1 project Store Analytics Dashboard: Internal / TENTATIVE / lead Peter matches JSON
  PASS  A.1 task table parsed: 10 rows
  PASS  A.1 task POS Upgrade › ปรับปรุงระบบ POS หน้าร้าน (Cindy) == JSON (5 weeks, sum 1875 cd)
  PASS  A.1 task POS Upgrade › ทำ UAT + คู่มือหน้าร้าน (Ivy) == JSON (4 weeks, sum 875 cd)
  PASS  A.1 task POS Upgrade › Rollout สาขา (Mint, TENTATIVE) == JSON (5 weeks, sum 1875 cd)
  PASS  A.1 task Data Warehouse › ย้าย pipeline ขึ้น BigQuery (Peter) == JSON (8 weeks, sum 3000 cd)
  PASS  A.1 task Mobile App Revamp › ออกแบบ flow ใหม่ (Jack) == JSON (8 weeks, sum 3000 cd)
  PASS  A.1 task Mobile App Revamp › พัฒนา front-end (Mint) == JSON (7 weeks, sum 2875 cd)
  PASS  A.1 task CRM Migration › ย้ายข้อมูลลูกค้า (Cindy) == JSON (5 weeks, sum 1500 cd)
  PASS  A.1 task CRM Migration › ตั้งค่า automation (Ivy) == JSON (4 weeks, sum 1000 cd)
  PASS  A.1 task Store Analytics Dashboard › ทำ dashboard ผู้บริหาร (Peter) == JSON (7 weeks, sum 2500 cd)
  PASS  A.1 task Store Analytics Dashboard › เก็บ requirement + สรุป (Jack) == JSON (4 weeks, sum 1000 cd)
  PASS  A.1 footnote: all years 2026, sums must equal F1 (§11.3)

## 5. SPEC §11.3 text vs recomputation
  PASS  §11.3 F1: total 195.00 committed 116.25 OVER 0 RISK 0 ↔ 19500 / 11625 cd, 0 overloads
  PASS  §11.3 per-project POS Upgrade: 46.25/27.50 d ↔ 4625/2750 cd
  PASS  §11.3 per-project Data Warehouse: 30.00/30.00 d ↔ 3000/3000 cd
  PASS  §11.3 per-project Mobile App Revamp: 58.75/58.75 d ↔ 5875/5875 cd
  PASS  §11.3 per-project CRM Migration: 25.00/0 d ↔ 2500/0 cd
  PASS  §11.3 per-project Store Analytics Dashboard: 35.00/0 d ↔ 3500/0 cd
  PASS  §11.3 F2 holiday 2026-10-23 is a Friday (Fri) and equals JSON F2.setup
  PASS  §11.3 F2 Jack: week 2026-10-19 OVER excess 1.00 cause CAPACITY (5.0 / 4.0) ↔ computed
  PASS  §11.3 F2 Mint: week 2026-10-19 OVER excess 1.00 cause CAPACITY (5.0 / 4.0) ↔ computed
  PASS  §11.3 F3 Peter leave 2026-10-05..2026-10-06 (Mon–Tue) → week 2026-10-05 OVER 2.00 CAPACITY (5.0 / 3.0) ↔ computed
  PASS  §11.3 F4 Cindy leave 2026-10-12..2026-10-14 (Mon–Wed) → week 2026-10-12 RISK 0.50 (total 2.5, committed 0, cap 2.0) ↔ computed (cause CAPACITY; §11.3 omits the cause, JSON says CAPACITY)
  PASS  §11.3 range text "31 ส.ค. – 28 ธ.ค. 2026" = the 18 weekStarts (last week runs to 2027-01-03)

## 6. Derived facts

### 6.1 F1 user × week total cd (T = tentative, i.e. committed 0 for that cell)
| week | Manager | Cindy | Ivy | Peter | Jack | Mint | team total | team committed |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 2026-08-31 | · | 500 | · | 250 | · | · | 750 | 750 |
| 2026-09-07 | · | 500 | · | 250 | 250 | · | 1000 | 1000 |
| 2026-09-14 | · | 375 | 250 | 375 | 250 | · | 1250 | 1250 |
| 2026-09-21 | · | 250 | 250 | 500 | 375 | · | 1375 | 1375 |
| 2026-09-28 ←today | · | 250 | 250 | 500 | 375 | 250 | 1625 | 1625 |
| 2026-10-05 | · | 250T | 125 | 500 | 500 | 500 | 1875 | 1625 |
| 2026-10-12 | · | 250T | 250T | 375 | 500 | 500 | 1875 | 1375 |
| 2026-10-19 | · | 375T | 250T | 250 | 500 | 500 | 1875 | 1250 |
| 2026-10-26 | · | 375T | 250T | · | 250 | 500 | 1375 | 750 |
| 2026-11-02 | · | 250T | 250T | 250T | · | 375 | 1125 | 375 |
| 2026-11-09 | · | · | · | 375T | 250T | 250 | 875 | 250 |
| 2026-11-16 | · | · | · | 500T | 250T | · | 750 | 0 |
| 2026-11-23 | · | · | · | 500T | 250T | · | 750 | 0 |
| 2026-11-30 | · | · | · | 375T | 250T | 250T | 875 | 0 |
| 2026-12-07 | · | · | · | 250T | · | 375T | 625 | 0 |
| 2026-12-14 | · | · | · | 250T | · | 500T | 750 | 0 |
| 2026-12-21 | · | · | · | · | · | 500T | 500 | 0 |
| 2026-12-28 | · | · | · | · | · | 250T | 250 | 0 |
| **sum** | 0 | 3375 | 1875 | 5500 | 4000 | 4750 | 19500 | 11625 |
| **sum committed** | 0 | 1875 | 875 | 3000 | 3000 | 2875 | | |

### 6.2 Per task: weeks, sum (grid "รวม" column shows 1 decimal half-up)
| project | task | assignee | effective certainty | first..last week | #weeks | sum cd | grid "รวม" |
|---|---|---|---|---|---:|---:|---:|
| POS Upgrade | ปรับปรุงระบบ POS หน้าร้าน | Cindy | CONFIRMED (project) | 2026-08-31..2026-09-28 | 5 | 1875 | 18.8 |
| POS Upgrade | ทำ UAT + คู่มือหน้าร้าน | Ivy | CONFIRMED (project) | 2026-09-14..2026-10-05 | 4 | 875 | 8.8 |
| Data Warehouse | ย้าย pipeline ขึ้น BigQuery | Peter | CONFIRMED (project) | 2026-08-31..2026-10-19 | 8 | 3000 | 30.0 |
| Mobile App Revamp | ออกแบบ flow ใหม่ | Jack | CONFIRMED (project) | 2026-09-07..2026-10-26 | 8 | 3000 | 30.0 |
| Mobile App Revamp | พัฒนา front-end | Mint | CONFIRMED (project) | 2026-09-28..2026-11-09 | 7 | 2875 | 28.8 |
| CRM Migration | ย้ายข้อมูลลูกค้า | Cindy | TENTATIVE (project) | 2026-10-05..2026-11-02 | 5 | 1500 | 15.0 |
| CRM Migration | ตั้งค่า automation | Ivy | TENTATIVE (project) | 2026-10-12..2026-11-02 | 4 | 1000 | 10.0 |
| Store Analytics Dashboard | ทำ dashboard ผู้บริหาร | Peter | TENTATIVE (project) | 2026-11-02..2026-12-14 | 7 | 2500 | 25.0 |
| Store Analytics Dashboard | เก็บ requirement + สรุป | Jack | TENTATIVE (project) | 2026-11-09..2026-11-30 | 4 | 1000 | 10.0 |
| POS Upgrade | Rollout สาขา | Mint | TENTATIVE (override) | 2026-11-30..2026-12-28 | 5 | 1875 | 18.8 |

### 6.3 Per project weekly totals (F1) and grid footer capacity (people = project assignees)
- **POS Upgrade** (CONFIRMED, lead Cindy; people in grid: Cindy, Ivy, Mint; footer capacity F1 = 1500 cd/week = 15.0)
  - 08-31: 500 · 09-07: 500 · 09-14: 625 · 09-21: 500 · 09-28: 500 · 10-05: 125 · 11-30: 250 · 12-07: 375 · 12-14: 500 · 12-21: 500 · 12-28: 250
- **Data Warehouse** (CONFIRMED, lead Peter; people in grid: Peter; footer capacity F1 = 500 cd/week = 5.0)
  - 08-31: 250 · 09-07: 250 · 09-14: 375 · 09-21: 500 · 09-28: 500 · 10-05: 500 · 10-12: 375 · 10-19: 250
- **Mobile App Revamp** (CONFIRMED, lead Jack; people in grid: Jack, Mint; footer capacity F1 = 1000 cd/week = 10.0)
  - 09-07: 250 · 09-14: 250 · 09-21: 375 · 09-28: 625 · 10-05: 1000 · 10-12: 1000 · 10-19: 1000 · 10-26: 750 · 11-02: 375 · 11-09: 250
- **CRM Migration** (TENTATIVE, lead Cindy; people in grid: Cindy, Ivy; footer capacity F1 = 1000 cd/week = 10.0)
  - 10-05: 250 · 10-12: 500 · 10-19: 625 · 10-26: 625 · 11-02: 500
- **Store Analytics Dashboard** (TENTATIVE, lead Peter; people in grid: Peter, Jack; footer capacity F1 = 1000 cd/week = 10.0)
  - 11-02: 250 · 11-09: 625 · 11-16: 750 · 11-23: 750 · 11-30: 625 · 12-07: 250 · 12-14: 250

### 6.4 Memberships (derived: lead = LEAD, assignees = MEMBER via BR-60) and §3.3 visibility
- POS Upgrade: Cindy (LEAD), Ivy (MEMBER), Mint (MEMBER)
- Data Warehouse: Peter (LEAD)
- Mobile App Revamp: Jack (LEAD), Mint (MEMBER)
- CRM Migration: Cindy (LEAD), Ivy (MEMBER)
- Store Analytics Dashboard: Peter (LEAD), Jack (MEMBER)

| viewer | role | LEAD of | member of | sees totals of | sees details (names) of projects |
|---|---|---|---|---|---|
| Manager | manager | — | — (manager sees all) | Manager, Cindy, Ivy, Peter, Jack, Mint | POS Upgrade, Data Warehouse, Mobile App Revamp, CRM Migration, Store Analytics Dashboard |
| Cindy | worker | POS Upgrade, CRM Migration | POS Upgrade, CRM Migration | Manager, Cindy, Ivy, Peter, Jack, Mint | POS Upgrade, CRM Migration |
| Ivy | worker | — | POS Upgrade, CRM Migration | Cindy, Ivy, Mint | POS Upgrade, CRM Migration |
| Peter | worker | Data Warehouse, Store Analytics Dashboard | Data Warehouse, Store Analytics Dashboard | Manager, Cindy, Ivy, Peter, Jack, Mint | Data Warehouse, Store Analytics Dashboard |
| Jack | worker | Mobile App Revamp | Mobile App Revamp, Store Analytics Dashboard | Manager, Cindy, Ivy, Peter, Jack, Mint | Mobile App Revamp, Store Analytics Dashboard |
| Mint | worker | — | POS Upgrade, Mobile App Revamp | Cindy, Ivy, Jack, Mint | POS Upgrade, Mobile App Revamp |

Masked rows ("งานในโปรเจคอื่น") a viewer would get on /people/<target> (non-empty weeks only):
- Cindy → /people/Peter: masked 08-31:250 09-07:250 09-14:375 09-21:500 09-28:500 10-05:500 10-12:375 10-19:250 11-02:250 11-09:375 11-16:500 11-23:500 11-30:375 12-07:250 12-14:250 — JSON must NOT contain: "Data Warehouse", "ย้าย pipeline ขึ้น BigQuery", "Store Analytics Dashboard", "ทำ dashboard ผู้บริหาร"
- Cindy → /people/Jack: masked 09-07:250 09-14:250 09-21:375 09-28:375 10-05:500 10-12:500 10-19:500 10-26:250 11-09:250 11-16:250 11-23:250 11-30:250 — JSON must NOT contain: "Mobile App Revamp", "ออกแบบ flow ใหม่", "Store Analytics Dashboard", "เก็บ requirement + สรุป"
- Cindy → /people/Mint: masked 09-28:250 10-05:500 10-12:500 10-19:500 10-26:500 11-02:375 11-09:250 — JSON must NOT contain: "Mobile App Revamp", "พัฒนา front-end"
- Ivy → /people/Mint: masked 09-28:250 10-05:500 10-12:500 10-19:500 10-26:500 11-02:375 11-09:250 — JSON must NOT contain: "Mobile App Revamp", "พัฒนา front-end"
- Peter → /people/Cindy: masked 08-31:500 09-07:500 09-14:375 09-21:250 09-28:250 10-05:250 10-12:250 10-19:375 10-26:375 11-02:250 — JSON must NOT contain: "POS Upgrade", "ปรับปรุงระบบ POS หน้าร้าน", "CRM Migration", "ย้ายข้อมูลลูกค้า"
- Peter → /people/Ivy: masked 09-14:250 09-21:250 09-28:250 10-05:125 10-12:250 10-19:250 10-26:250 11-02:250 — JSON must NOT contain: "POS Upgrade", "ทำ UAT + คู่มือหน้าร้าน", "CRM Migration", "ตั้งค่า automation"
- Peter → /people/Jack: masked 09-07:250 09-14:250 09-21:375 09-28:375 10-05:500 10-12:500 10-19:500 10-26:250 — JSON must NOT contain: "Mobile App Revamp", "ออกแบบ flow ใหม่"
- Peter → /people/Mint: masked 09-28:250 10-05:500 10-12:500 10-19:500 10-26:500 11-02:375 11-09:250 11-30:250 12-07:375 12-14:500 12-21:500 12-28:250 — JSON must NOT contain: "Mobile App Revamp", "พัฒนา front-end", "POS Upgrade", "Rollout สาขา"
- Jack → /people/Cindy: masked 08-31:500 09-07:500 09-14:375 09-21:250 09-28:250 10-05:250 10-12:250 10-19:375 10-26:375 11-02:250 — JSON must NOT contain: "POS Upgrade", "ปรับปรุงระบบ POS หน้าร้าน", "CRM Migration", "ย้ายข้อมูลลูกค้า"
- Jack → /people/Ivy: masked 09-14:250 09-21:250 09-28:250 10-05:125 10-12:250 10-19:250 10-26:250 11-02:250 — JSON must NOT contain: "POS Upgrade", "ทำ UAT + คู่มือหน้าร้าน", "CRM Migration", "ตั้งค่า automation"
- Jack → /people/Peter: masked 08-31:250 09-07:250 09-14:375 09-21:500 09-28:500 10-05:500 10-12:375 10-19:250 — JSON must NOT contain: "Data Warehouse", "ย้าย pipeline ขึ้น BigQuery"
- Jack → /people/Mint: masked 11-30:250 12-07:375 12-14:500 12-21:500 12-28:250 — JSON must NOT contain: "POS Upgrade", "Rollout สาขา"
- Mint → /people/Cindy: masked 10-05:250 10-12:250 10-19:375 10-26:375 11-02:250 — JSON must NOT contain: "CRM Migration", "ย้ายข้อมูลลูกค้า"
- Mint → /people/Ivy: masked 10-12:250 10-19:250 10-26:250 11-02:250 — JSON must NOT contain: "CRM Migration", "ตั้งค่า automation"
- Mint → /people/Jack: masked 11-09:250 11-16:250 11-23:250 11-30:250 — JSON must NOT contain: "Store Analytics Dashboard", "เก็บ requirement + สรุป"

Project list / clients visible per viewer (§3.2 rows "เห็นโปรเจคในลิสต์" and "ดูลูกค้า"); every other project URL → 404:
- Manager: projects [POS Upgrade, Data Warehouse, Mobile App Revamp, CRM Migration, Store Analytics Dashboard] · clients [Coral, Bluebird, Sunrise, Internal] · 404: [—]
- Cindy: projects [POS Upgrade, CRM Migration] · clients [Coral, Sunrise] · 404: [Data Warehouse, Mobile App Revamp, Store Analytics Dashboard]
- Ivy: projects [POS Upgrade, CRM Migration] · clients [Coral, Sunrise] · 404: [Data Warehouse, Mobile App Revamp, Store Analytics Dashboard]
- Peter: projects [Data Warehouse, Store Analytics Dashboard] · clients [Coral, Internal] · 404: [POS Upgrade, Mobile App Revamp, CRM Migration]
- Jack: projects [Mobile App Revamp, Store Analytics Dashboard] · clients [Bluebird, Internal] · 404: [POS Upgrade, Data Warehouse, CRM Migration]
- Mint: projects [POS Upgrade, Mobile App Revamp] · clients [Coral, Bluebird] · 404: [Data Warehouse, CRM Migration, Store Analytics Dashboard]

Pairs where the viewer may NOT see the target's workload at all (expect 404 on /people/<target> and no row in /workload): Ivy→Manager, Ivy→Peter, Ivy→Jack, Mint→Manager, Mint→Peter

### 6.5 "Today" = 2026-09-30 (Wed) → this week 2026-09-28
- index of this week in weekStarts: 4 (0-based) → 4 weeks of history before it, 13 after
- /workload default 12 weeks from this week: 2026-09-28..2026-12-14 (golden weeks 2026-12-21, 2026-12-28 are to the right, off-screen initially)
- home "ภาระของฉัน 8 สัปดาห์": 2026-09-28..2026-11-16
- FR-1007 badge "4 สัปดาห์ข้างหน้า": 2026-09-28, 2026-10-05, 2026-10-12, 2026-10-19 (if it includes this week) or 2026-10-05, 2026-10-12, 2026-10-19, 2026-10-26 (if it starts next week)

Home "my load 8 weeks" (total cd) per user from this week (F1):
- Manager: 0, 0, 0, 0, 0, 0, 0, 0
- Cindy: 250, 250, 250, 375, 375, 250, 0, 0
- Ivy: 250, 125, 250, 250, 250, 250, 0, 0
- Peter: 500, 500, 375, 250, 0, 250, 375, 500
- Jack: 375, 500, 500, 500, 250, 0, 250, 250
- Mint: 250, 500, 500, 500, 500, 375, 250, 0

"งานของฉันสัปดาห์นี้" (week 2026-09-28) and /my grouping (this week / next week / later / unplanned) per user (F1):
- Manager: this week [] · next week [] · later []
- Cindy: this week [ปรับปรุงระบบ POS หน้าร้าน (POS Upgrade) 2.50 d] · next week [ย้ายข้อมูลลูกค้า (CRM Migration)] · later []
- Ivy: this week [ทำ UAT + คู่มือหน้าร้าน (POS Upgrade) 2.50 d] · next week [] · later [ตั้งค่า automation (CRM Migration) from 2026-10-12]
- Peter: this week [ย้าย pipeline ขึ้น BigQuery (Data Warehouse) 5.00 d] · next week [] · later [ทำ dashboard ผู้บริหาร (Store Analytics Dashboard) from 2026-11-02]
- Jack: this week [ออกแบบ flow ใหม่ (Mobile App Revamp) 3.75 d] · next week [] · later [เก็บ requirement + สรุป (Store Analytics Dashboard) from 2026-11-09]
- Mint: this week [พัฒนา front-end (Mobile App Revamp) 2.50 d] · next week [] · later [Rollout สาขา (POS Upgrade) from 2026-11-30]
- F1 team utilisation 2026-09-28..2026-10-19: total 7250 / cap(all 6 users) 12000 = 60.4%; / cap(5 workers, excl. Manager) 10000 = 72.5%; committed 5875 → 49% / 58.8%
- F2 team utilisation 2026-09-28..2026-10-19: total 7250 / cap(all 6 users) 11400 = 63.6%; / cap(5 workers, excl. Manager) 9500 = 76.3%; committed 5875 → 51.5% / 61.8%
- F3 team utilisation 2026-09-28..2026-10-19: total 7250 / cap(all 6 users) 11800 = 61.4%; / cap(5 workers, excl. Manager) 9800 = 74%; committed 5875 → 49.8% / 59.9%
- F4 team utilisation 2026-09-28..2026-10-19: total 7250 / cap(all 6 users) 11700 = 62%; / cap(5 workers, excl. Manager) 9700 = 74.7%; committed 5875 → 50.2% / 60.6%

### 6.6 BR-45 colour of every non-empty cell ("ทั้งหมด" view uses total; "แน่นอน" view uses committed)
- F1: total-view {"EMPTY":51,"GREEN":16,"YELLOW":41}; committed-view {"EMPTY":76,"GREEN":12,"YELLOW":20} (108 cells = 6 users × 18 weeks)
  - RED (total view): none
  - GREEN cells (= total 500): Cindy 08-31, Cindy 09-07, Peter 09-21, Peter 09-28, Peter 10-05, Peter 11-16, Peter 11-23, Jack 10-05, Jack 10-12, Jack 10-19, Mint 10-05, Mint 10-12, Mint 10-19, Mint 10-26, Mint 12-14, Mint 12-21
- F2: total-view {"EMPTY":51,"GREEN":15,"YELLOW":40,"RED":2}; committed-view {"EMPTY":76,"GREEN":10,"YELLOW":20,"RED":2} (108 cells = 6 users × 18 weeks)
  - RED (total view): Jack 10-19 (500/400, OVER), Mint 10-19 (500/400, OVER)
  - colour changes vs F1: Cindy 10-19: YELLOW→GREEN (375/400), Jack 10-19: GREEN→RED (500/400), Mint 10-19: GREEN→RED (500/400)
- F3: total-view {"EMPTY":51,"GREEN":15,"YELLOW":41,"RED":1}; committed-view {"EMPTY":76,"GREEN":11,"YELLOW":20,"RED":1} (108 cells = 6 users × 18 weeks)
  - RED (total view): Peter 10-05 (500/300, OVER)
  - colour changes vs F1: Peter 10-05: GREEN→RED (500/300)
- F4: total-view {"EMPTY":51,"GREEN":16,"YELLOW":40,"RED":1}; committed-view {"EMPTY":76,"GREEN":12,"YELLOW":20} (108 cells = 6 users × 18 weeks)
  - RED (total view): Cindy 10-12 (250/200, RISK)
  - colour changes vs F1: Cindy 10-12: YELLOW→RED (250/200)

### 6.7 Day-level view of the affected weeks (BR-21 derived values, BR-40 per day)
- F1 Ivy week 2026-09-28 (250 cd, CONFIRMED; week cap 500):
  - Mon 09-28 cap 100 → 50 (0.5) · Tue 09-29 cap 100 → 50 (0.5) · Wed 09-30 cap 100 → 50 (0.5) · Thu 10-01 cap 100 → 50 (0.5) · Fri 10-02 cap 100 → 50 (0.5)
- F1 Peter week 2026-10-12 (375 cd, CONFIRMED; week cap 500):
  - Mon 10-12 cap 100 → 75 (0.8) · Tue 10-13 cap 100 → 75 (0.8) · Wed 10-14 cap 100 → 75 (0.8) · Thu 10-15 cap 100 → 75 (0.8) · Fri 10-16 cap 100 → 75 (0.8)
- F2 Jack week 2026-10-19 (500 cd, CONFIRMED; week cap 400):
  - Mon 10-19 cap 100 → 125 (1.3) OVER+25 WORKLOAD · Tue 10-20 cap 100 → 125 (1.3) OVER+25 WORKLOAD · Wed 10-21 cap 100 → 125 (1.3) OVER+25 WORKLOAD · Thu 10-22 cap 100 → 125 (1.3) OVER+25 WORKLOAD · Fri 10-23 cap 0 → 0 (—)
  - ⚠ 4 derived day value(s) > 100 cd → BR-22 (WEEK→DAY on edit) would have to write DAY rows > 1.00, which BR-26 / DDL check (person_days <= 1 for DAY) forbid
- F2 Mint week 2026-10-19 (500 cd, CONFIRMED; week cap 400):
  - Mon 10-19 cap 100 → 125 (1.3) OVER+25 WORKLOAD · Tue 10-20 cap 100 → 125 (1.3) OVER+25 WORKLOAD · Wed 10-21 cap 100 → 125 (1.3) OVER+25 WORKLOAD · Thu 10-22 cap 100 → 125 (1.3) OVER+25 WORKLOAD · Fri 10-23 cap 0 → 0 (—)
  - ⚠ 4 derived day value(s) > 100 cd → BR-22 (WEEK→DAY on edit) would have to write DAY rows > 1.00, which BR-26 / DDL check (person_days <= 1 for DAY) forbid
- F2 Peter week 2026-10-19 (250 cd, CONFIRMED; week cap 400):
  - Mon 10-19 cap 100 → 63 (0.6) · Tue 10-20 cap 100 → 63 (0.6) · Wed 10-21 cap 100 → 62 (0.6) · Thu 10-22 cap 100 → 62 (0.6) · Fri 10-23 cap 0 → 0 (—)
- F2 Cindy week 2026-10-19 (375 cd, TENTATIVE; week cap 400):
  - Mon 10-19 cap 100 → 94 (0.9) · Tue 10-20 cap 100 → 94 (0.9) · Wed 10-21 cap 100 → 94 (0.9) · Thu 10-22 cap 100 → 93 (0.9) · Fri 10-23 cap 0 → 0 (—)
- F2 Ivy week 2026-10-19 (250 cd, TENTATIVE; week cap 400):
  - Mon 10-19 cap 100 → 63 (0.6) · Tue 10-20 cap 100 → 63 (0.6) · Wed 10-21 cap 100 → 62 (0.6) · Thu 10-22 cap 100 → 62 (0.6) · Fri 10-23 cap 0 → 0 (—)
- F3 Peter week 2026-10-05 (500 cd, CONFIRMED; week cap 300):
  - Mon 10-05 cap 0 → 0 (—) · Tue 10-06 cap 0 → 0 (—) · Wed 10-07 cap 100 → 167 (1.7) OVER+67 WORKLOAD · Thu 10-08 cap 100 → 167 (1.7) OVER+67 WORKLOAD · Fri 10-09 cap 100 → 166 (1.7) OVER+66 WORKLOAD
  - ⚠ 3 derived day value(s) > 100 cd → BR-22 (WEEK→DAY on edit) would have to write DAY rows > 1.00, which BR-26 / DDL check (person_days <= 1 for DAY) forbid
- F4 Cindy week 2026-10-12 (250 cd, TENTATIVE; week cap 200):
  - Mon 10-12 cap 0 → 0 (—) · Tue 10-13 cap 0 → 0 (—) · Wed 10-14 cap 0 → 0 (—) · Thu 10-15 cap 100 → 125 (1.3) RISK+25 WORKLOAD · Fri 10-16 cap 100 → 125 (1.3) RISK+25 WORKLOAD
  - ⚠ 2 derived day value(s) > 100 cd → BR-22 (WEEK→DAY on edit) would have to write DAY rows > 1.00, which BR-26 / DDL check (person_days <= 1 for DAY) forbid

### 6.8 Acceptance-criteria example numbers
- AC-802 (F3): Peter week 2026-10-05 capacity 300 cd → key "f" writes 300 (3.0 d), key "h" writes 150 (1.5 d); before: DW "ย้าย pipeline ขึ้น BigQuery" = 500 (5.0), OVER +200 CAPACITY
  - after "f": total 300/300 → OK, colour GREEN; F3 overload list becomes empty; DW total 3000→2800, F1-style grand total 19500→19300, committed 11625→11425
  - same key under F1 (no leave) writes 500 (no change); under F2 on Jack/Mint 2026-10-19 writes 400; under F4 on Cindy 2026-10-12 writes 200
- AC-801 option A (POS grid, Cindy row, 6 weeks from 2026-08-31): 08-31: 500→300 (Cindy total 300) · 09-07: 500→300 (Cindy total 300) · 09-14: 375→300 (Cindy total 300) · 09-21: 250→300 (Cindy total 300) · 09-28: 250→300 (Cindy total 300) · 10-05: 0→300 (Cindy total 550 RISK+50) — task sum 1875→1800
- AC-801 option B (POS grid, Cindy row, 6 weeks from this week 2026-09-28): 09-28: 250→300 (Cindy total 300) · 10-05: 0→300 (Cindy total 550 RISK+50) · 10-12: 0→300 (Cindy total 550 RISK+50) · 10-19: 0→300 (Cindy total 675 RISK+175) · 10-26: 0→300 (Cindy total 675 RISK+175) · 11-02: 0→300 (Cindy total 550 RISK+50) — task sum 1875→3425
- AC-801 option C (CRM grid, Cindy row, 6 weeks from 2026-10-05): 10-05: 250→300 (Cindy total 300) · 10-12: 250→300 (Cindy total 300) · 10-19: 375→300 (Cindy total 300) · 10-26: 375→300 (Cindy total 300) · 11-02: 250→300 (Cindy total 300) · 11-09: 0→300 (Cindy total 300) — task sum 1500→1800
- AC-804 F1 Ivy week 2026-09-28: derived 0.5 / 0.5 / 0.5 / 0.5 / 0.5 → set Wed 2026-09-30 = 1.0 → DAY rows 09-28:50 09-29:50 09-30:100 10-01:50 10-02:50 = 300 cd (3.0)
- AC-804 F2 Ivy week 2026-09-28: derived 0.5 / 0.5 / 0.5 / 0.5 / 0.5 → set Wed 2026-09-30 = 1.0 → DAY rows 09-28:50 09-29:50 09-30:100 10-01:50 10-02:50 = 300 cd (3.0)
- AC-804 F1 Ivy week 2026-10-19: derived 0.5 / 0.5 / 0.5 / 0.5 / 0.5 → set Wed 2026-10-21 = 1.0 → DAY rows 10-19:50 10-20:50 10-21:100 10-22:50 10-23:50 = 300 cd (3.0)
- AC-804 F2 Ivy week 2026-10-19: derived 0.6 / 0.6 / 0.6 / 0.6 / — → set Wed 2026-10-21 = 1.0 → DAY rows 10-19:63 10-20:63 10-21:100 10-22:62 = 288 cd (2.9)
- BR-24 SCALE of Ivy 2026-09-28 DAY [50,50,100,50,50] (=300) to 400: [67,67,133,67,66]  ⚠ contains a DAY value > 100 cd (violates BR-26 / DDL check)
- BR-24 SCALE of Ivy 2026-09-28 DAY [50,50,100,50,50] (=300) to 350: [59,58,117,58,58]  ⚠ contains a DAY value > 100 cd (violates BR-26 / DDL check)
- BR-24 SCALE of Ivy 2026-09-28 DAY [50,50,100,50,50] (=300) to 200: [34,33,67,33,33]
- BR-25/FR-612 Ivy 10 d over 2026-11-11..2026-11-24 (F1, Ivy free those weeks? load 0,0,0): DAY 11-11:100 11-12:100 11-13:100 | WEEK 2026-11-16=500 | DAY 11-23:100 11-24:100
- BR-25/FR-612 Ivy 5 d over 2026-11-11..2026-11-24: DAY 11-11:50 11-12:50 11-13:50 | WEEK 2026-11-16=250 | DAY 11-23:50 11-24:50
- BR-25/FR-612 Ivy 2 d over 2026-11-11..2026-11-13 (remainder case): DAY 11-11:67 11-12:67 11-13:66
- BR-25/FR-612 Ivy 4 d over 2026-11-11..2026-11-13 (more than capacity): DAY 11-11:134 11-12:133 11-13:133  ⚠ DAY values > 100

Free capacity (500 − total) per user-week in F1 where the user has NO allocation (clean cells for e2e writes):
- Manager: 08-31, 09-07, 09-14, 09-21, 09-28, 10-05, 10-12, 10-19, 10-26, 11-02, 11-09, 11-16, 11-23, 11-30, 12-07, 12-14, 12-21, 12-28
- Cindy: 11-09, 11-16, 11-23, 11-30, 12-07, 12-14, 12-21, 12-28
- Ivy: 08-31, 09-07, 11-09, 11-16, 11-23, 11-30, 12-07, 12-14, 12-21, 12-28
- Peter: 10-26, 12-21, 12-28
- Jack: 08-31, 11-02, 12-07, 12-14, 12-21, 12-28
- Mint: 08-31, 09-07, 09-14, 09-21, 11-16, 11-23

### 6.9 BR-13 example: deactivate Cindy on 2026-09-30 (inclusive)
- Cindy 2026-09-28 OVER +50 CAPACITY (total 250, committed 250, cap 200)
- Cindy 2026-10-05 RISK +250 CAPACITY (total 250, committed 0, cap 0)
- Cindy 2026-10-12 RISK +250 CAPACITY (total 250, committed 0, cap 0)
- Cindy 2026-10-19 RISK +375 CAPACITY (total 375, committed 0, cap 0)
- Cindy 2026-10-26 RISK +375 CAPACITY (total 375, committed 0, cap 0)
- Cindy 2026-11-02 RISK +250 CAPACITY (total 250, committed 0, cap 0)

### 6.10 Combined fixtures
- F2+F3 (= §8.5 mock state): total 19500, committed 11625; overloads Peter 2026-10-05 OVER+200 CAPACITY · Jack 2026-10-19 OVER+100 CAPACITY · Mint 2026-10-19 OVER+100 CAPACITY
- F2+F3+F4 (all at once): total 19500, committed 11625; overloads Peter 2026-10-05 OVER+200 CAPACITY · Cindy 2026-10-12 RISK+50 CAPACITY · Jack 2026-10-19 OVER+100 CAPACITY · Mint 2026-10-19 OVER+100 CAPACITY
- demo (A.2: Peter leave, no holiday) + Kickoff workshop DAY 09-07 Jack/Mint 50: total 19600, committed 11725; overloads Peter 2026-10-05 OVER+200 CAPACITY
  - demo: Jack 09-07 = 300, Mint 09-07 = 50; Mobile total 5875→5975

### 6.11 A.2 demo milestones: BR-70 status on 2026-09-30, week column, BR-71 lateness
- POS › UAT sign-off 2026-10-02 (Fri, grid week 2026-09-28): 2 d from today → DUE_SOON · in home "14 days" card · bound to "ทำ UAT + คู่มือหน้าร้าน" → late weeks (week_start > date): 2026-10-05
- POS › Go-live สาขาแรก 2026-12-21 (Mon, grid week 2026-12-21): 82 d from today → UPCOMING
- DW › Pipeline พร้อมใช้งาน 2026-10-23 (Fri, grid week 2026-10-19): 23 d from today → UPCOMING
- Mobile › Design freeze 2026-10-09 (Fri, grid week 2026-10-05): 9 d from today → UPCOMING · in home "14 days" card
- Mobile › Beta release 2026-11-13 (Fri, grid week 2026-11-09): 44 d from today → UPCOMING
- CRM › Data migration complete 2026-11-06 (Fri, grid week 2026-11-02): 37 d from today → UPCOMING
- Store › Dashboard v1 review 2026-12-11 (Fri, grid week 2026-12-07): 72 d from today → UPCOMING
- tasks with plan in week 2026-10-26 (AC-702 candidates, week_start 10-26 > a 10-23 milestone): ออกแบบ flow ใหม่ (Mobile App Revamp, Jack 250); พัฒนา front-end (Mobile App Revamp, Mint 500); ย้ายข้อมูลลูกค้า (CRM Migration, Cindy 375); ตั้งค่า automation (CRM Migration, Ivy 250)

## 6b. Badges (FR-1007), manager home card, FR-906 impact, synthetic WORKLOAD/BOTH cases
- F1: FR-1007 badge per viewer (window incl. this week/window from next week when different): Manager 0 · Cindy 0 · Ivy 0 · Peter 0 · Jack 0 · Mint 0; manager card "ล้นสัปดาห์นี้+หน้า": none
- F2: FR-1007 badge per viewer (window incl. this week/window from next week when different): Manager 2 · Cindy 2 · Ivy 1 · Peter 2 · Jack 2 · Mint 2; manager card "ล้นสัปดาห์นี้+หน้า": none
- F3: FR-1007 badge per viewer (window incl. this week/window from next week when different): Manager 1 · Cindy 1 · Ivy 0 · Peter 1 · Jack 1 · Mint 0; manager card "ล้นสัปดาห์นี้+หน้า": Peter 2026-10-05 OVER
- F4: FR-1007 badge per viewer (window incl. this week/window from next week when different): Manager 0 · Cindy 0 · Ivy 0 · Peter 0 · Jack 0 · Mint 0; manager card "ล้นสัปดาห์นี้+หน้า": none
- F2+F3: FR-1007 badge per viewer (window incl. this week/window from next week when different): Manager 3 · Cindy 3 · Ivy 1 · Peter 3 · Jack 3 · Mint 2; manager card "ล้นสัปดาห์นี้+หน้า": Peter 2026-10-05 OVER
- demo: FR-1007 badge per viewer (window incl. this week/window from next week when different): Manager 1 · Cindy 1 · Ivy 0 · Peter 1 · Jack 1 · Mint 0; manager card "ล้นสัปดาห์นี้+หน้า": Peter 2026-10-05 OVER
- FR-906 F3: Peter leave 2026-10-05..2026-10-06 → week 2026-10-05 capacity 5.00 → 3.00 d (500→300 cd); new: OVER +2.00 CAPACITY
- FR-906 F4: Cindy leave 2026-10-12..2026-10-14 → week 2026-10-12 capacity 5.00 → 2.00 d (500→200 cd); new: RISK +0.50 CAPACITY
- WORKLOAD / OVER: F1 + 125 cd CONFIRMED extra for Jack 2026-10-05: total 625, committed 625, cap 500, standard 500 → OVER +125 WORKLOAD
- WORKLOAD / RISK: F1 + 250 cd TENTATIVE extra for Cindy 2026-10-19: total 625, committed 0, cap 500, standard 500 → RISK +125 WORKLOAD
- BOTH / OVER (committed < total): F2 + 125 cd TENTATIVE extra for Jack 2026-10-19: total 625, committed 500, cap 400, standard 500 → OVER +100 BOTH (excess = committed − cap; total − cap would be 225)
- BOTH / RISK: F4 + 300 cd TENTATIVE extra for Cindy 2026-10-12: total 550, committed 0, cap 200, standard 500 → RISK +350 BOTH
- boundary load = cap → OK: F2 with Jack 2026-10-19 reduced to 400 (key "f"): total 400, committed 400, cap 400, standard 500 → OK

## 7. SPEC §8 UI mock numbers vs data (illustrative mocks; informative)
  PASS  §8.3 POS grid row "ปรับปรุงระบบ POS หน้าร้าน" 14/9..19/10 = [3.8,2.5,2.5,,,] (mock [3.8,2.5,2.5,,,])
  PASS  §8.3 POS grid row "ทำ UAT + คู่มือหน้าร้าน" 14/9..19/10 = [2.5,2.5,2.5,1.3,,] (mock [2.5,2.5,2.5,1.3,,])
  PASS  §8.3 POS grid row "Rollout สาขา" 14/9..19/10 = [,,,,,] (mock [,,,,,])
  PASS  §8.3 "รวม" ปรับปรุงระบบ POS หน้าร้าน = 1875 cd → 18.8 (mock 18.8)
  PASS  §8.3 "รวม" ทำ UAT + คู่มือหน้าร้าน = 875 cd → 8.8 (mock 8.8)
  PASS  §8.3 "รวม" Rollout สาขา = 1875 cd → 18.8 (mock 18.8)
  PASS  §8.3 footer ภาระรวม (POS only) = [6.3,5.0,5.0,1.3,,] (mock [6.3,5.0,5.0,1.3,,])
  PASS  §8.3 footer Capacity (Cindy+Ivy+Mint) under F2 = [15.0,15.0,15.0,15.0,15.0,12.0] (mock ends with 12.0 → the mock assumes the F2 holiday; under F1 it is [15.0,15.0,15.0,15.0,15.0,15.0])
  PASS  §8.3 ◆UAT (2026-10-02) sits in column 28/9 (weekStart = 2026-09-28)
  PASS  §8.4 Peter 19 ต.ค. derived (F2) = [0.6,0.6,0.6,0.6,] (mock ╌0.6 ×4 + holiday) — exact cd 63,63,62,62,0
  FAIL  §8.4 Jack 19 ต.ค. derived (F2) = [1.3,1.3,1.3,1.3,] (mock shows solid 1.0 ×4) — exact cd 125,125,125,125,0
  PASS  §8.4 neighbours: Jack 12/10 5.0, Peter 12/10 3.8, Jack 26/10 2.5, Peter 26/10 empty
  PASS  §8.5 Jack row (F2+F3) = [3.8/5,5/5,5/5,5/4🔴,2.5/5] (mock [3.8/5, 5/5, 5/5, 5/4🔴, 2.5/5])
  PASS  §8.5 Peter row (F2+F3) = [5/5,5/3🔴,3.8/5,2.5/4,–] (mock [5/5, 5/3🔴, 3.8/5, 2.5/4, –])
  PASS  §8.5 "รายการที่ล้น (3)" = number of overloads under F2+F3 = 3
  PASS  §8.2 Cindy 8-week bars ▅▅ ▅▅ ▅▅ ▇▇ ▇▇ ▅▅ ▁▁ ▁▁ ↔ [250,250,250,375,375,250,0,0]
  PASS  §8.2 "พุธ 30 ก.ย. 2569" — 2026-09-30 is a Wednesday (BE 2569 = CE 2026 + 543)
  PASS  §8.2 "ปรับปรุงระบบ POS … 2.5 วัน" this week for Cindy = 250 cd
  FAIL  §8.2 mock lists "◆ 9 ต.ค. Design freeze · Mobile" on Cindy's home, but Cindy is not a member of Mobile App Revamp (member of POS, CRM only) → §3.3 says milestones of projects without access are hidden

## 8. distribute(): SPEC sample (float) vs integer-exact largest remainder
  PASS  weights ⊂ {0,50,100} (full/half days), t = 1..700: 169400 cases, float≠exact in 0, sum≠t in 0
  INFO  random weights 1..100 (part-time schedules, numeric(3,2) fractions): 300000 cases, float≠exact in 346; examples: [{"t":574,"w":[23,25,59,98,26,74,31],"float":[39,43,101,167,44,127,53],"exact":[39,43,101,168,44,126,53]},{"t":668,"w":[98,4,42,38,18,90,30],"float":[204,8,88,79,38,188,63],"exact":[205,8,88,79,37,188,63]},{"t":81,"w":[34,3,85,64,83,92,44],"float":[7,0,17,13,17,18,9],"exact":[7,1,17,13,16,18,9]}]
  INFO  distribute(50,[10,40,100]): SPEC float → [3,13,34], exact → [4,13,33] (all three fractional parts are exactly 1/3 — tie must go to the earliest day)
  INFO  distribute(100,[25,75,100,100]): SPEC float → [8,25,34,33], exact → [9,25,33,33]

## 9. Display rounding (SPEC §8.8: 1 decimal in grid) — float formatting pitfalls
  INFO  375 cd → integer half-up "3.8" · (cd/100).toFixed(1) "3.8" · Intl(max 1) "3.8"
  INFO  125 cd → integer half-up "1.3" · (cd/100).toFixed(1) "1.3" · Intl(max 1) "1.3"
  INFO  625 cd → integer half-up "6.3" · (cd/100).toFixed(1) "6.3" · Intl(max 1) "6.3"
  INFO  1875 cd → integer half-up "18.8" · (cd/100).toFixed(1) "18.8" · Intl(max 1) "18.8"
  INFO  35 cd → integer half-up "0.4" · (cd/100).toFixed(1) "0.3" · Intl(max 1) "0.4"   ← differs
  INFO  45 cd → integer half-up "0.5" · (cd/100).toFixed(1) "0.5" · Intl(max 1) "0.5"
  INFO  105 cd → integer half-up "1.1" · (cd/100).toFixed(1) "1.1" · Intl(max 1) "1.1"
  INFO  115 cd → integer half-up "1.2" · (cd/100).toFixed(1) "1.1" · Intl(max 1) "1.2"   ← differs
  INFO  145 cd → integer half-up "1.5" · (cd/100).toFixed(1) "1.4" · Intl(max 1) "1.5"   ← differs
  INFO  1005 cd → integer half-up "10.1" · (cd/100).toFixed(1) "10.1" · Intl(max 1) "10.1"
  INFO  63 cd → integer half-up "0.6" · (cd/100).toFixed(1) "0.6" · Intl(max 1) "0.6"
  INFO  62 cd → integer half-up "0.6" · (cd/100).toFixed(1) "0.6" · Intl(max 1) "0.6"
  INFO  167 cd → integer half-up "1.7" · (cd/100).toFixed(1) "1.7" · Intl(max 1) "1.7"
  INFO  166 cd → integer half-up "1.7" · (cd/100).toFixed(1) "1.7" · Intl(max 1) "1.7"

## Summary
  checks failed: 2
  - §8.4 Jack 19 ต.ค. derived (F2) = [1.3,1.3,1.3,1.3,] (mock shows solid 1.0 ×4) — exact cd 125,125,125,125,0
  - §8.2 mock lists "◆ 9 ต.ค. Design freeze · Mobile" on Cindy's home, but Cindy is not a member of Mobile App Revamp (member of POS, CRM only) → §3.3 says milestones of projects without access are hidden
````

### 7.2 `python3 verify-excel.py` — full output (excel-run.txt)

````text
## E1. v2 workbook vs golden-fixtures.json
  PASS  Plan week columns F..W = 2026-08-31..2026-12-28 (18) == JSON weekStarts
  PASS  every Excel week column is a Monday
  PASS  Plan has 10 data rows (rows 6..15)
  PASS  Setup people ['Cindy', 'Ivy', 'Peter', 'Jack', 'Mint'] (JSON adds a 'Manager' demo user not in Excel)
  PASS  Setup clients ['Coral', 'Bluebird', 'Sunrise', 'Internal'] == JSON clients
  PASS  Setup certainty POS Upgrade: CONFIRMED == JSON CONFIRMED
  PASS  Setup certainty Data Warehouse: CONFIRMED == JSON CONFIRMED
  PASS  Setup certainty Mobile App Revamp: CONFIRMED == JSON CONFIRMED
  PASS  Setup certainty CRM Migration: TENTATIVE == JSON TENTATIVE
  PASS  Setup certainty Store Analytics Dashboard: TENTATIVE == JSON TENTATIVE
  PASS  row 6 POS Upgrade › ปรับปรุงระบบ POS หน้าร้าน (Cindy): fractions×500 == JSON allocationsCd; JSON order index 0 == 0
  PASS  row 6 client column A 'Coral' == JSON project.client 'Coral'
  PASS  row 7 POS Upgrade › ทำ UAT + คู่มือหน้าร้าน (Ivy): fractions×500 == JSON allocationsCd; JSON order index 1 == 1
  PASS  row 7 client column A 'Coral' == JSON project.client 'Coral'
  PASS  row 8 Data Warehouse › ย้าย pipeline ขึ้น BigQuery (Peter): fractions×500 == JSON allocationsCd; JSON order index 2 == 2
  PASS  row 8 client column A 'Coral' == JSON project.client 'Coral'
  PASS  row 9 Mobile App Revamp › ออกแบบ flow ใหม่ (Jack): fractions×500 == JSON allocationsCd; JSON order index 3 == 3
  PASS  row 9 client column A 'Bluebird' == JSON project.client 'Bluebird'
  PASS  row 10 Mobile App Revamp › พัฒนา front-end (Mint): fractions×500 == JSON allocationsCd; JSON order index 4 == 4
  PASS  row 10 client column A 'Bluebird' == JSON project.client 'Bluebird'
  PASS  row 11 CRM Migration › ย้ายข้อมูลลูกค้า (Cindy): fractions×500 == JSON allocationsCd; JSON order index 5 == 5
  PASS  row 11 client column A 'Sunrise' == JSON project.client 'Sunrise'
  PASS  row 12 CRM Migration › ตั้งค่า automation (Ivy): fractions×500 == JSON allocationsCd; JSON order index 6 == 6
  PASS  row 12 client column A 'Sunrise' == JSON project.client 'Sunrise'
  PASS  row 13 Store Analytics Dashboard › ทำ dashboard ผู้บริหาร (Peter): fractions×500 == JSON allocationsCd; JSON order index 7 == 7
  PASS  row 13 client column A 'Internal' == JSON project.client 'Internal'
  PASS  row 14 Store Analytics Dashboard › เก็บ requirement + สรุป (Jack): fractions×500 == JSON allocationsCd; JSON order index 8 == 8
  PASS  row 14 client column A 'Internal' == JSON project.client 'Internal'
  PASS  row 15 POS Upgrade › Rollout สาขา (Mint, override อาจไม่ทำ): fractions×500 == JSON allocationsCd; JSON order index 9 == 9
  PASS  row 15 client column A 'Coral' == JSON project.client 'Coral'
  PASS  every Excel description ends with ' (ตัวอย่าง — ลบได้)' which the JSON strips
  PASS  Excel-rule overloads (cap 1.00): OVER 0, เสี่ยง 0; max person-week total = 500 cd
  PASS  Excel sums: total 19500 / committed 11625 cd (= 39.00 / 23.25 fractions) == expected F1

## E2. v1 workbook (Workload_Planner_Aug-Dec_2026.xlsx) vs v2
  INFO  v1 sheets: ['Setup', 'Plan', 'Timeline รายคน', 'Workload รายคน', 'สรุปรายโปรเจค', 'แจ้งเตือน Overload']; v2 sheets: ['Setup', 'Plan', 'Timeline รายคน', 'Workload รายคน', 'สรุปรายโปรเจค', 'แจ้งเตือน Overload']
  INFO  v1 certainty column present: False; v1 Setup projects: [('POS Upgrade', '1.'), ('Data Warehouse', '2.'), ('Mobile App Revamp', '3.'), ('CRM Migration', None), ('Store Analytics Dashboard', '1.00')]
  PASS  v1 Plan rows (10) have the same project/description/person/fractions as v2 (v2 only adds certainty)

## Summary
  failures: 0
````

### 7.3 `node rounding-probe.mjs` — output

````json
{
 "node": "v26.5.0",
 "icu": "78.3",
 "range": "0..70000 cd",
 "toFixedMismatches": 2800,
 "toFixedExamples": [
  [
   15,
   "0.1",
   "0.2"
  ],
  [
   35,
   "0.3",
   "0.4"
  ],
  [
   85,
   "0.8",
   "0.9"
  ],
  [
   95,
   "0.9",
   "1.0"
  ],
  [
   115,
   "1.1",
   "1.2"
  ]
 ],
 "intlEnMismatches": 0,
 "intlExamples": [],
 "intlThMismatches": 0,
 "thSample": "3.8",
 "intlResolved": "halfExpand"
}
````

### 7.4 Source: `verify-golden.mjs`

````js
#!/usr/bin/env node
// verify-golden.mjs — independent recomputation of docs/reference/golden-fixtures.json
// against SPEC.md business rules (BR-10..13 capacity, BR-35..37 certainty, BR-40..45 overload),
// SPEC §11.3 text and SPEC Appendix A.1 tables.
//
// Rules honoured by this script (same as the app must):
//   * all load math in integer centi-days (cd, 100 = 1 person-day) — no float load math (BR-01)
//   * plan dates are 'YYYY-MM-DD' strings, date math via civil-day numbers, never JS Date (BR-04)
// JS Date is used ONLY in the self-test that cross-checks this script's own date helpers.
//
// Usage: node verify-golden.mjs            (prints report, writes facts.json next to this file)
//        PLAN_ROOT=/path/to/plan-system node verify-golden.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.PLAN_ROOT ?? '/Users/thammasorn.har/Desktop/plan-system';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const G = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/reference/golden-fixtures.json'), 'utf8'));
const SPEC = fs.readFileSync(path.join(ROOT, 'SPEC.md'), 'utf8');
const TODAY = '2026-09-30';

let failures = 0;
const discrepancies = [];
const out = [];
const log = (...a) => out.push(a.join(' '));
const h = (t) => log(`\n## ${t}`);
function check(cond, msg) {
  if (cond) log(`  PASS  ${msg}`);
  else { failures++; discrepancies.push(msg); log(`  FAIL  ${msg}`); }
}
const fmtD = (cd) => { // exact cd -> "x.yy" person-days (integer string math)
  const s = cd < 0 ? '-' : ''; const a = Math.abs(cd);
  return `${s}${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`;
};
const fmt1 = (cd) => { // 1-decimal grid display, half-up, from integer cd (no float)
  if (cd === 0) return '';
  const tenths = Math.floor((cd + 5) / 10);
  return `${Math.floor(tenths / 10)}.${tenths % 10}`;
};

// ───────────────────────── dates (BR-04..06) — no JS Date ─────────────────────────
function daysFromCivil(y, m, d) { // Howard Hinnant's algorithm
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}
function civilFromDays(z) {
  z += 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  return [yoe + era * 400 + (m <= 2 ? 1 : 0), m, d];
}
const toDays = (iso) => { const [y, m, d] = iso.split('-').map(Number); return daysFromCivil(y, m, d); };
const fromDays = (n) => { const [y, m, d] = civilFromDays(n); return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; };
const addDays = (iso, n) => fromDays(toDays(iso) + n);
const isoWeekday = (iso) => ((((toDays(iso) + 3) % 7) + 7) % 7) + 1; // 1 = Monday
const weekStart = (iso) => addDays(iso, 1 - isoWeekday(iso));
const daysOfWeek = (ws) => Array.from({ length: 7 }, (_, i) => addDays(ws, i));
function weekRange(from, to) { // Mondays in [from, to)
  const res = [];
  for (let w = weekStart(from); w < to; w = addDays(w, 7)) if (w >= from) res.push(w);
  return res;
}
const diffDays = (a, b) => toDays(a) - toDays(b);
const TH_DOW = ['', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'];
const EN_DOW = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ───────────────────────── capacity (BR-10..13) ─────────────────────────
function dayCapacityCd(schedule, holidays, timeOff, d, deactivatedOn = null) {
  if (deactivatedOn && d >= deactivatedOn) return 0;               // BR-13 (inclusive, assumption)
  const base = schedule[isoWeekday(d)] ?? 0;                       // cd: 100 full day
  if (base === 0 || holidays.has(d)) return 0;                     // BR-10, BR-12
  const off = timeOff.filter((t) => t.startDate <= d && d <= t.endDate)
    .reduce((s, t) => s + t.fractionCd, 0);                        // 100 full, 50 half
  return Math.max(0, base - off);
}
const weekCapacityCd = (schedule, holidays, timeOff, ws, deact = null) =>
  daysOfWeek(ws).reduce((s, d) => s + dayCapacityCd(schedule, holidays, timeOff, d, deact), 0); // BR-11
const standardWeekCd = (schedule, ws) => daysOfWeek(ws).reduce((s, d) => s + (schedule[isoWeekday(d)] ?? 0), 0);

// ───────────────────────── distribute (BR-21) ─────────────────────────
function distributeSpecFloat(totalCd, weights) { // verbatim from SPEC §5.3
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (sumW === 0) return weights.map(() => 0);
  const raw = weights.map((w) => (totalCd * w) / sumW);
  const floor = raw.map(Math.floor);
  let rem = totalCd - floor.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - floor[i] }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) { if (rem-- <= 0) break; floor[i]++; }
  return floor;
}
function distributeExact(totalCd, weights) { // integer-only largest remainder, ties -> earlier index
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (sumW === 0) return weights.map(() => 0);
  const num = weights.map((w) => totalCd * w);
  const r = num.map((n) => n % sumW);
  const q = num.map((n, i) => (n - r[i]) / sumW);
  let rem = totalCd - q.reduce((a, b) => a + b, 0);
  const order = weights.map((_, i) => i).sort((a, b) => r[b] - r[a] || a - b);
  for (const i of order) { if (rem <= 0) break; q[i]++; rem--; }
  return q;
}

// ───────────────────────── overload (BR-40, BR-41, BR-45) ─────────────────────────
function overload({ totalCd, committedCd, capacityCd, standardCd }) {
  let level = 'OK';
  if (committedCd > capacityCd) level = 'OVER';
  else if (totalCd > capacityCd) level = 'RISK';
  if (level === 'OK') return { level };
  // excess: OVER = committed - cap, RISK = total - cap (Excel v2 'แจ้งเตือน Overload' formulas; §11.3 values)
  const excessCd = level === 'OVER' ? committedCd - capacityCd : totalCd - capacityCd;
  const lost = standardCd - capacityCd;
  const cause = lost > 0 && totalCd > standardCd ? 'BOTH' : lost > 0 ? 'CAPACITY' : 'WORKLOAD';
  return { level, excessCd, cause };
}
function color(loadCd, capCd) { // BR-45, integer comparisons (ratio >= 0.8  <=>  5*load >= 4*cap)
  if (capCd === 0) return loadCd > 0 ? 'RED' : 'GREY_STRIPE';
  if (loadCd === 0) return 'EMPTY';
  if (loadCd > capCd) return 'RED';
  if (5 * loadCd >= 4 * capCd) return 'GREEN';
  return 'YELLOW';
}

// ───────────────────────── model from JSON ─────────────────────────
const WEEKS = G.weekStarts;
const users = G.users.map((u) => ({ ...u, schedule: Object.fromEntries(Object.entries(u.scheduleCd).map(([k, v]) => [Number(k), v])) }));
const userByNick = new Map(users.map((u) => [u.nickname, u]));
const projByName = new Map(G.projects.map((p) => [p.name, p]));
const tasks = G.tasks.map((t, idx) => ({ ...t, idx, parent: null }));
function effectiveCertainty(task) { // BR-35 (golden tasks are all depth 0)
  const parent = task.parent; const grand = parent?.parent;
  return task.certaintyOverride ?? parent?.certaintyOverride ?? grand?.certaintyOverride ?? projByName.get(task.project).certainty;
}
function baseAllocations() {
  const res = [];
  for (const t of tasks) {
    const cert = effectiveCertainty(t);
    for (const [period, cd] of Object.entries(t.allocationsCd)) {
      res.push({ user: t.assignee, project: t.project, task: t.name, granularity: t.granularity, period, weekStart: weekStart(period), cd, cert });
    }
  }
  return res;
}
function scenario(setup = {}, extraAllocations = []) {
  const holidays = new Set((setup.holidays ?? []).map((x) => x.date));
  const timeOff = new Map(users.map((u) => [u.nickname, []]));
  for (const t of setup.timeOff ?? []) timeOff.get(t.user).push({ startDate: t.startDate, endDate: t.endDate, fractionCd: t.half == null ? 100 : 50 });
  const deact = setup.deactivated ?? {};
  const allocs = [...baseAllocations(), ...extraAllocations];
  const cap = (nick, ws) => weekCapacityCd(userByNick.get(nick).schedule, holidays, timeOff.get(nick), ws, deact[nick] ?? null);
  const std = (nick, ws) => standardWeekCd(userByNick.get(nick).schedule, ws);
  const dayCap = (nick, d) => dayCapacityCd(userByNick.get(nick).schedule, holidays, timeOff.get(nick), d, deact[nick] ?? null);
  function load(nick, ws) {
    let totalCd = 0, committedCd = 0;
    for (const a of allocs) if (a.user === nick && a.weekStart === ws) { totalCd += a.cd; if (a.cert === 'CONFIRMED') committedCd += a.cd; }
    return { totalCd, committedCd };
  }
  function cells(weeks = WEEKS) {
    const res = [];
    for (const u of users) for (const ws of weeks) {
      const l = load(u.nickname, ws);
      const c = { user: u.nickname, week: ws, ...l, capacityCd: cap(u.nickname, ws), standardCd: std(u.nickname, ws) };
      res.push({ ...c, ...overload(c) });
    }
    return res;
  }
  function overloads(weeks = WEEKS) {
    return cells(weeks).filter((c) => c.level !== 'OK')
      .map(({ user, week, level, excessCd, cause, totalCd, committedCd, capacityCd }) => ({ user, week, level, excessCd, cause, totalCd, committedCd, capacityCd }))
      .sort((a, b) => (a.week < b.week ? -1 : a.week > b.week ? 1 : a.user < b.user ? -1 : a.user > b.user ? 1 : 0));
  }
  // derived daily view of a WEEK allocation (BR-21 / BR-21a)
  function derivedDays(nick, ws, weekCd) {
    const days = daysOfWeek(ws);
    const caps = days.map((d) => dayCap(nick, d));
    const sched = days.map((d) => userByNick.get(nick).schedule[isoWeekday(d)] ?? 0);
    const zeroCap = caps.reduce((a, b) => a + b, 0) === 0;
    return { days, caps, values: distributeExact(weekCd, zeroCap ? sched : caps), warnNonWorking: zeroCap && weekCd > 0 };
  }
  return { holidays, timeOff, allocs, cap, std, dayCap, load, cells, overloads, derivedDays };
}

// ───────────────────────── 0. self-tests of this script's helpers ─────────────────────────
h('0. Self-tests of the helper functions used by this script');
{
  let bad = 0;
  for (let n = toDays('2025-12-01'); n <= toDays('2028-01-31'); n++) {
    const iso = fromDays(n);
    const js = new Date(Date.UTC(...iso.split('-').map((x, i) => (i === 1 ? Number(x) - 1 : Number(x)))));
    const jsIso = js.toISOString().slice(0, 10);
    const jsDow = ((js.getUTCDay() + 6) % 7) + 1;
    if (jsIso !== iso || jsDow !== isoWeekday(iso)) bad++;
  }
  check(bad === 0, 'civil-day date helpers agree with JS Date(UTC) for every day 2025-12-01..2028-01-31');
  check(weekStart('2027-01-01') === '2026-12-28' && weekStart('2027-01-03') === '2026-12-28' && weekStart('2027-01-04') === '2027-01-04',
    "weekStart crosses the year: 2027-01-01/03 -> 2026-12-28; 2027-01-04 -> 2027-01-04; addDays('2026-12-28',7) = " + addDays('2026-12-28', 7));
  // SPEC §5.2 capacity table (week of Mon 2026-11-16, schedule Mon-Fri 100)
  const full = { 1: 100, 2: 100, 3: 100, 4: 100, 5: 100 };
  const pt = { 1: 100, 3: 100, 5: 100 };
  const W = '2026-11-16';
  const cases = [
    ['ปกติ', full, [], [], 500],
    ['ลา 2 วัน', full, [], [{ startDate: '2026-11-16', endDate: '2026-11-17', fractionCd: 100 }], 300],
    ['ลาครึ่งวันบ่ายวันศุกร์', full, [], [{ startDate: '2026-11-20', endDate: '2026-11-20', fractionCd: 50 }], 450],
    ['พาร์ตไทม์ จ/พ/ศ', pt, [], [], 300],
    ['พาร์ตไทม์ จ/พ/ศ + ลาวันพุธ', pt, [], [{ startDate: '2026-11-18', endDate: '2026-11-18', fractionCd: 100 }], 200],
    ['วันหยุดวันศุกร์ + ลาวันศุกร์', full, ['2026-11-20'], [{ startDate: '2026-11-20', endDate: '2026-11-20', fractionCd: 100 }], 400],
    ['ลาทั้งสัปดาห์', full, [], [{ startDate: '2026-11-16', endDate: '2026-11-20', fractionCd: 100 }], 0],
  ];
  for (const [label, sch, hol, to, exp] of cases) {
    const got = weekCapacityCd(sch, new Set(hol), to, W);
    check(got === exp, `SPEC §5.2 case "${label}" -> ${got} (expected ${exp})`);
  }
}

// ───────────────────────── 0b. bootstrap alignment + todayBangkok instants ─────────────────────────
h('0b. Alignment with SPEC §10.4 bootstrap / FR-902, and todayBangkok() instants');
{
  const boot = SPEC.match(/ถ้ายังไม่มี `positions` → seed: (.+)$/m)[1].split(',').map((s) => s.trim());
  check(JSON.stringify(boot) === JSON.stringify(G.positions), `JSON positions [${G.positions}] == §10.4 bootstrap positions (same order)`);
  const lt = SPEC.match(/\(seed: (ลาพักร้อน[^)]*)\)/)[1].split(',').map((s) => s.trim());
  const used = [...new Set(Object.values(G.expected).flatMap((f) => (f.setup?.timeOff ?? []).map((t) => t.type)))];
  check(used.every((u) => lt.includes(u)), `leave type(s) used by fixtures [${used}] ⊂ FR-902 seed [${lt}] → leave_types must exist before applying F3/F4 (bootstrap step 2)`);
  // todayBangkok via Intl (instants are the only legit JS Date use: "now")
  const tb = (instant) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(instant));
  const probes = [['2026-09-29T23:30:00Z', '2026-09-30'], ['2026-09-30T16:59:59Z', '2026-09-30'], ['2026-09-30T17:00:00Z', '2026-10-01'], ['2026-12-31T17:00:00Z', '2027-01-01']];
  for (const [i, e] of probes) check(tb(i) === e, `todayBangkok at ${i} = ${tb(i)} (expected ${e}; Bangkok = UTC+7, no DST)`);
}

// ───────────────────────── 1. structural checks of the JSON ─────────────────────────
h('1. Structural checks of golden-fixtures.json');
{
  check(WEEKS.length === 18, `weekStarts has 18 entries (${WEEKS.length})`);
  check(WEEKS[0] === '2026-08-31' && WEEKS[17] === '2026-12-28', `weekStarts spans ${WEEKS[0]}..${WEEKS[17]}`);
  check(WEEKS.every((w) => isoWeekday(w) === 1), 'every weekStart is a Monday');
  check(WEEKS.every((w, i) => i === 0 || diffDays(w, WEEKS[i - 1]) === 7), 'weekStarts are consecutive (7-day steps)');
  check(JSON.stringify(weekRange('2026-08-31', '2027-01-04')) === JSON.stringify(WEEKS), "weekRange('2026-08-31','2027-01-04') == weekStarts (note: exclusive end must be 2027-01-04, not 2026-12-28)");
  check(weekRange('2026-08-31', '2026-12-28').length === 17, "weekRange('2026-08-31','2026-12-28') has only 17 weeks (drops 2026-12-28) — off-by-one trap");
  check(users.length === 6 && new Set(users.map((u) => u.nickname)).size === 6, 'users: 6 unique nicknames');
  check(users.every((u) => JSON.stringify(u.scheduleCd) === JSON.stringify({ 1: 100, 2: 100, 3: 100, 4: 100, 5: 100 })), 'every user schedule = Mon..Fri 100 cd (no Sat/Sun rows)');
  check(users.every((u) => G.positions.includes(u.position)), 'every user.position is in positions[]');
  check(G.projects.every((p) => G.clients.includes(p.client)), 'every project.client is in clients[]');
  check(G.projects.every((p) => userByNick.has(p.lead)), 'every project.lead is a user');
  check(tasks.every((t) => projByName.has(t.project) && userByNick.has(t.assignee)), 'every task.project / task.assignee resolves');
  check(tasks.every((t) => t.granularity === 'WEEK'), 'every task granularity = WEEK');
  const allVals = tasks.flatMap((t) => Object.entries(t.allocationsCd));
  check(allVals.every(([k]) => WEEKS.includes(k)), 'every allocation key is one of weekStarts (Monday)');
  check(allVals.every(([, v]) => Number.isInteger(v) && v > 0 && v <= 700), 'every allocation value is an integer 0 < v <= 700 (BR-26 WEEK)');
  check(allVals.every(([, v]) => v % 25 === 0), 'every allocation value is a multiple of 25 cd (BR-27 0.25-day grid)');
  check(allVals.every(([, v]) => v % 125 === 0), 'every allocation value is a multiple of 125 cd (= Excel fraction 0.25 x 500)');
  check(allVals.length === 57, `number of (task, week) allocation rows = ${allVals.length} (expected 57)`);
  const perUserWeek = new Map();
  for (const t of tasks) for (const w of Object.keys(t.allocationsCd)) { const k = `${t.assignee}|${w}`; perUserWeek.set(k, (perUserWeek.get(k) ?? 0) + 1); }
  check(Math.max(...perUserWeek.values()) === 1, 'no user has two allocations in the same week (every user-week has at most ONE task) → committed is always 0 or = total');
  check(tasks.filter((t) => t.certaintyOverride).length === 1 && tasks.find((t) => t.certaintyOverride).name === 'Rollout สาขา', 'exactly one certainty override: "Rollout สาขา" = TENTATIVE (in a CONFIRMED project)');
  for (const [k, f] of Object.entries(G.expected)) {
    const desc = f.description;
    if (k === 'F1') continue;
    const m = desc.match(/^F1 \+ (.*)$/s);
    const parsed = m ? JSON.parse(m[1]) : null; // description embeds Python-style json.dumps (", " / ": " separators)
    check(parsed && JSON.stringify(parsed) === JSON.stringify(f.setup), `${k}.description == "F1 + <${k}.setup as JSON>" → fixtures are independent (each is F1 + its own setup, NOT cumulative)`);
  }
}

// ───────────────────────── 2. F1 recomputation ─────────────────────────
const F1 = scenario({});
h('2. F1 (no holidays, no leave) — totals, per project, per user×week');
{
  const allocs = F1.allocs.filter((a) => WEEKS.includes(a.weekStart));
  const total = allocs.reduce((s, a) => s + a.cd, 0);
  const committed = allocs.filter((a) => a.cert === 'CONFIRMED').reduce((s, a) => s + a.cd, 0);
  check(total === G.expected.F1.totalCd, `F1 total ${total} cd (${fmtD(total)} d) == expected ${G.expected.F1.totalCd}`);
  check(committed === G.expected.F1.committedCd, `F1 committed ${committed} cd (${fmtD(committed)} d) == expected ${G.expected.F1.committedCd}`);
  for (const p of G.projects) {
    const pa = allocs.filter((a) => a.project === p.name);
    const t = pa.reduce((s, a) => s + a.cd, 0);
    const c = pa.filter((a) => a.cert === 'CONFIRMED').reduce((s, a) => s + a.cd, 0);
    const e = G.expected.F1.byProject[p.name];
    check(e && e.totalCd === t && e.committedCd === c, `byProject ${p.name}: computed ${t}/${c} vs expected ${e?.totalCd}/${e?.committedCd}`);
  }
  check(Object.keys(G.expected.F1.byProject).length === G.projects.length, 'expected.F1.byProject has exactly the 5 projects');
  // entry by entry
  let nEntries = 0, nOk = 0;
  const cells = F1.cells();
  for (const [nick, weeks] of Object.entries(G.expected.F1.byUserWeek)) {
    for (const [ws, e] of Object.entries(weeks)) {
      nEntries++;
      const c = cells.find((x) => x.user === nick && x.week === ws);
      const ok = c && c.totalCd === e.totalCd && c.committedCd === e.committedCd && c.capacityCd === e.capacityCd;
      if (ok) nOk++; else check(false, `byUserWeek ${nick} ${ws}: computed ${c?.totalCd}/${c?.committedCd}/${c?.capacityCd} vs expected ${e.totalCd}/${e.committedCd}/${e.capacityCd}`);
    }
  }
  check(nOk === nEntries, `expected.F1.byUserWeek: ${nOk}/${nEntries} entries match (total, committed, capacity)`);
  const nonZero = cells.filter((c) => c.totalCd > 0);
  const missing = nonZero.filter((c) => !G.expected.F1.byUserWeek[c.user]?.[c.week]);
  check(missing.length === 0 && nonZero.length === nEntries, `every computed non-zero user×week (${nonZero.length}) is present in expected.F1.byUserWeek (${nEntries}); missing: ${missing.map((m) => m.user + ' ' + m.week).join(', ') || 'none'}`);
  const zeroListed = Object.entries(G.expected.F1.byUserWeek).flatMap(([n, w]) => Object.entries(w).filter(([, e]) => e.totalCd === 0).map(([ws]) => `${n} ${ws}`));
  check(zeroListed.length === 0, 'expected.F1.byUserWeek lists only non-zero cells (zero-load weeks are omitted → tests must treat absent = 0/0/500)');
  check(!('Manager' in G.expected.F1.byUserWeek), 'Manager has no entries in byUserWeek (no allocations; capacity 500 every week)');
  const ov = F1.overloads();
  check(ov.length === 0 && G.expected.F1.overloads.length === 0, `F1 overloads: computed ${ov.length}, expected ${G.expected.F1.overloads.length} (OVER 0, RISK 0)`);
  // every cell capacity 500 in F1
  check(cells.every((c) => c.capacityCd === 500 && c.standardCd === 500), 'F1: every user×week capacity = standard = 500 cd');
}

// ───────────────────────── 3. F2/F3/F4 overload lists ─────────────────────────
h('3. F2 / F3 / F4 overload lists (level, excessCd, cause, total, committed, capacity)');
const FIX = {};
for (const key of ['F2', 'F3', 'F4']) {
  const f = G.expected[key];
  const S = scenario(f.setup);
  FIX[key] = S;
  const got = S.overloads();
  const exp = [...f.overloads].sort((a, b) => (a.week < b.week ? -1 : a.week > b.week ? 1 : a.user < b.user ? -1 : 1));
  const same = JSON.stringify(got) === JSON.stringify(exp.map(({ user, week, level, excessCd, cause, totalCd, committedCd, capacityCd }) => ({ user, week, level, excessCd, cause, totalCd, committedCd, capacityCd })));
  check(same, `${key}: computed overloads == expected (${got.length} item(s))`);
  for (const o of got) log(`        ${key} ${o.user} ${o.week} ${o.level} excess ${o.excessCd} (${fmtD(o.excessCd)} d) cause ${o.cause} total ${o.totalCd} committed ${o.committedCd} cap ${o.capacityCd}`);
  const capChanges = S.cells().filter((c) => c.capacityCd !== 500).map((c) => `${c.user} ${c.week} cap ${c.capacityCd}`);
  log(`        ${key} capacity cells != 500: ${capChanges.join(' · ')}`);
}
FIX.F1 = F1;

// ───────────────────────── 4. SPEC Appendix A.1 tables ─────────────────────────
h('4. SPEC Appendix A.1 tables vs JSON');
const a1 = SPEC.slice(SPEC.indexOf('### A.1'), SPEC.indexOf('### A.2'));
function daysStrToCd(s) { // "3.75" -> 375 using string math
  const [i, f = ''] = s.trim().split('.');
  return Number(i) * 100 + Number((f + '00').slice(0, 2));
}
{
  const uRows = [...a1.matchAll(/^\| (\S+) \| (\S+@\S+) \| (.+?) \| (manager|worker) \|$/gm)].map((m) => ({ nickname: m[1], email: m[2], position: m[3], role: m[4] }));
  check(uRows.length === 6, `A.1 users table parsed: ${uRows.length} rows`);
  for (const r of uRows) {
    const u = userByNick.get(r.nickname);
    check(u && u.email === r.email && u.position === r.position && u.role === r.role, `A.1 user ${r.nickname}: ${r.email} / ${r.position} / ${r.role} matches JSON`);
  }
  check(/ทุกคนทำงาน จ–ศ = 1\.00/.test(a1), 'A.1 "ทุกคนทำงาน จ–ศ = 1.00" ↔ JSON scheduleCd {1..5: 100}');
  check(/รหัสผ่าน dev: `demo1234`/.test(a1) && users.every((u) => u.devPassword === 'demo1234'), 'A.1 dev password demo1234 ↔ JSON devPassword');
  const cl = a1.match(/\*\*ลูกค้า:\*\* (.+)$/m)[1].split(',').map((s) => s.trim());
  check(JSON.stringify(cl) === JSON.stringify(G.clients), `A.1 clients [${cl}] == JSON clients`);
  const pRows = [...a1.matchAll(/^\| ([A-Za-z ]+?) \| (\w+) \| \**(CONFIRMED|TENTATIVE)\** \| (\w+) \|$/gm)].map((m) => ({ name: m[1], client: m[2], certainty: m[3], lead: m[4] }));
  check(pRows.length === 5, `A.1 projects table parsed: ${pRows.length} rows`);
  for (const r of pRows) {
    const p = projByName.get(r.name);
    check(p && p.client === r.client && p.certainty === r.certainty && p.lead === r.lead, `A.1 project ${r.name}: ${r.client} / ${r.certainty} / lead ${r.lead} matches JSON`);
  }
  const abbr = { POS: 'POS Upgrade', DW: 'Data Warehouse', Mobile: 'Mobile App Revamp', CRM: 'CRM Migration', Store: 'Store Analytics Dashboard' };
  const tRows = [...a1.matchAll(/^\| (POS|DW|Mobile|CRM|Store) \| (.+?) \| (\w+) \|\s*(.*?)\s*\| (.+?) \|$/gm)].map((m) => ({
    project: abbr[m[1]], name: m[2], assignee: m[3], override: m[4].replace(/\*/g, '').trim() || null,
    alloc: Object.fromEntries(m[5].split('·').map((x) => x.trim()).map((x) => { const [md, v] = x.split(':'); return [`2026-${md.trim()}`, daysStrToCd(v)]; })),
  }));
  check(tRows.length === 10, `A.1 task table parsed: ${tRows.length} rows`);
  for (const r of tRows) {
    const t = tasks.find((x) => x.project === r.project && x.name === r.name);
    const same = t && t.assignee === r.assignee && (t.certaintyOverride ?? null) === r.override && JSON.stringify(t.allocationsCd) === JSON.stringify(r.alloc);
    check(same, `A.1 task ${r.project} › ${r.name} (${r.assignee}${r.override ? ', ' + r.override : ''}) == JSON (${Object.keys(r.alloc).length} weeks, sum ${Object.values(r.alloc).reduce((a, b) => a + b, 0)} cd)`);
  }
  check(/\(ปีทั้งหมด = 2026\) — ผลรวมต้องตรง F1 ใน §11\.3/.test(a1), 'A.1 footnote: all years 2026, sums must equal F1 (§11.3)');
}

// ───────────────────────── 5. SPEC §11.3 text ─────────────────────────
h('5. SPEC §11.3 text vs recomputation');
const s113 = SPEC.slice(SPEC.indexOf('### 11.3'), SPEC.indexOf('### 11.4'));
{
  const m1 = s113.match(/total \*\*([\d.]+)\*\*, committed \*\*([\d.]+)\*\*; OVER (\d+), RISK (\d+)/);
  check(m1 && daysStrToCd(m1[1]) === 19500 && daysStrToCd(m1[2]) === 11625 && m1[3] === '0' && m1[4] === '0', `§11.3 F1: total ${m1?.[1]} committed ${m1?.[2]} OVER ${m1?.[3]} RISK ${m1?.[4]} ↔ 19500 / 11625 cd, 0 overloads`);
  const mp = s113.match(/POS ([\d.]+)\/([\d.]+) · DW ([\d.]+)\/([\d.]+) · Mobile ([\d.]+)\/([\d.]+) · CRM ([\d.]+)\/([\d.]+) · Store ([\d.]+)\/([\d.]+)/);
  const names = ['POS Upgrade', 'Data Warehouse', 'Mobile App Revamp', 'CRM Migration', 'Store Analytics Dashboard'];
  names.forEach((n, i) => {
    const t = daysStrToCd(mp[1 + 2 * i]), c = daysStrToCd(mp[2 + 2 * i]);
    const e = G.expected.F1.byProject[n];
    check(t === e.totalCd && c === e.committedCd, `§11.3 per-project ${n}: ${mp[1 + 2 * i]}/${mp[2 + 2 * i]} d ↔ ${e.totalCd}/${e.committedCd} cd`);
  });
  const m2 = s113.match(/วันหยุด ศุกร์ (\S+) \| \*\*OVER\*\*: Jack และ Mint สัปดาห์ (\S+) เกิน ([\d.]+) วัน สาเหตุ `(\w+)` \(([\d.]+) \/ ([\d.]+)\)/);
  check(m2 && m2[1] === G.expected.F2.setup.holidays[0].date && isoWeekday(m2[1]) === 5, `§11.3 F2 holiday ${m2?.[1]} is a Friday (${EN_DOW[isoWeekday(m2?.[1])]}) and equals JSON F2.setup`);
  for (const nick of ['Jack', 'Mint']) {
    const o = FIX.F2.overloads().find((x) => x.user === nick);
    check(o && o.week === m2[2] && o.excessCd === daysStrToCd(m2[3]) && o.cause === m2[4] && o.totalCd === daysStrToCd(m2[5]) && o.capacityCd === daysStrToCd(m2[6]) && o.level === 'OVER',
      `§11.3 F2 ${nick}: week ${m2[2]} OVER excess ${m2[3]} cause ${m2[4]} (${m2[5]} / ${m2[6]}) ↔ computed`);
  }
  const m3 = s113.match(/Peter ลา (\S+) ถึง (\S+) \| \*\*OVER\*\*: Peter สัปดาห์ (\S+) เกิน ([\d.]+) สาเหตุ `(\w+)` \(([\d.]+) \/ ([\d.]+)\)/);
  {
    const o = FIX.F3.overloads()[0];
    const st = G.expected.F3.setup.timeOff[0];
    check(m3 && st.startDate === m3[1] && st.endDate === m3[2] && o.week === m3[3] && o.excessCd === daysStrToCd(m3[4]) && o.cause === m3[5] && o.totalCd === daysStrToCd(m3[6]) && o.capacityCd === daysStrToCd(m3[7]),
      `§11.3 F3 Peter leave ${m3?.[1]}..${m3?.[2]} (${EN_DOW[isoWeekday(m3?.[1])]}–${EN_DOW[isoWeekday(m3?.[2])]}) → week ${m3?.[3]} OVER ${m3?.[4]} ${m3?.[5]} (${m3?.[6]} / ${m3?.[7]}) ↔ computed`);
  }
  const m4 = s113.match(/Cindy ลา (\S+) ถึง (\S+) \| \*\*RISK\*\*: Cindy สัปดาห์ (\S+) เกิน ([\d.]+) \(total ([\d.]+), committed ([\d.]+), cap ([\d.]+)\)/);
  {
    const o = FIX.F4.overloads()[0];
    const st = G.expected.F4.setup.timeOff[0];
    check(m4 && st.startDate === m4[1] && st.endDate === m4[2] && o.level === 'RISK' && o.week === m4[3] && o.excessCd === daysStrToCd(m4[4]) && o.totalCd === daysStrToCd(m4[5]) && o.committedCd === daysStrToCd(m4[6]) && o.capacityCd === daysStrToCd(m4[7]),
      `§11.3 F4 Cindy leave ${m4?.[1]}..${m4?.[2]} (${EN_DOW[isoWeekday(m4?.[1])]}–${EN_DOW[isoWeekday(m4?.[2])]}) → week ${m4?.[3]} RISK ${m4?.[4]} (total ${m4?.[5]}, committed ${m4?.[6]}, cap ${m4?.[7]}) ↔ computed (cause ${o.cause}; §11.3 omits the cause, JSON says CAPACITY)`);
  }
  check(/ช่วง 31 ส\.ค\. – 28 ธ\.ค\. 2026/.test(s113), '§11.3 range text "31 ส.ค. – 28 ธ.ค. 2026" = the 18 weekStarts (last week runs to 2027-01-03)');
}

// ───────────────────────── 6. derived facts ─────────────────────────
h('6. Derived facts');
const facts = {};
{
  // 6.1 user × week matrix (F1)
  log('\n### 6.1 F1 user × week total cd (T = tentative, i.e. committed 0 for that cell)');
  const nicks = users.map((u) => u.nickname);
  log('| week | ' + nicks.join(' | ') + ' | team total | team committed |');
  log('|---|' + nicks.map(() => '---:').join('|') + '|---:|---:|');
  facts.F1matrix = {};
  let grandT = 0, grandC = 0;
  for (const ws of WEEKS) {
    const row = []; let tt = 0, tc = 0;
    for (const n of nicks) {
      const l = F1.load(n, ws);
      tt += l.totalCd; tc += l.committedCd;
      facts.F1matrix[`${n}|${ws}`] = l;
      row.push(l.totalCd === 0 ? '·' : `${l.totalCd}${l.committedCd === 0 ? 'T' : l.committedCd === l.totalCd ? '' : '(c' + l.committedCd + ')'}`);
    }
    grandT += tt; grandC += tc;
    log(`| ${ws}${ws === weekStart(TODAY) ? ' ←today' : ''} | ${row.join(' | ')} | ${tt} | ${tc} |`);
  }
  log(`| **sum** | ${nicks.map((n) => WEEKS.reduce((s, w) => s + F1.load(n, w).totalCd, 0)).join(' | ')} | ${grandT} | ${grandC} |`);
  log(`| **sum committed** | ${nicks.map((n) => WEEKS.reduce((s, w) => s + F1.load(n, w).committedCd, 0)).join(' | ')} | | |`);

  // 6.2 per-task sums (grid "รวม" column)
  log('\n### 6.2 Per task: weeks, sum (grid "รวม" column shows 1 decimal half-up)');
  log('| project | task | assignee | effective certainty | first..last week | #weeks | sum cd | grid "รวม" |');
  log('|---|---|---|---|---|---:|---:|---:|');
  for (const t of tasks) {
    const ks = Object.keys(t.allocationsCd); const sum = Object.values(t.allocationsCd).reduce((a, b) => a + b, 0);
    log(`| ${t.project} | ${t.name} | ${t.assignee} | ${effectiveCertainty(t)}${t.certaintyOverride ? ' (override)' : ' (project)'} | ${ks[0]}..${ks[ks.length - 1]} | ${ks.length} | ${sum} | ${fmt1(sum)} |`);
  }

  // 6.3 per-project weekly totals + footer (people in grid = assignees of the project)
  log('\n### 6.3 Per project weekly totals (F1) and grid footer capacity (people = project assignees)');
  facts.projectWeekly = {};
  for (const p of G.projects) {
    const people = [...new Set(tasks.filter((t) => t.project === p.name).map((t) => t.assignee))];
    const cols = WEEKS.map((ws) => F1.allocs.filter((a) => a.project === p.name && a.weekStart === ws).reduce((s, a) => s + a.cd, 0));
    facts.projectWeekly[p.name] = Object.fromEntries(WEEKS.map((w, i) => [w, cols[i]]));
    log(`- **${p.name}** (${p.certainty}, lead ${p.lead}; people in grid: ${people.join(', ')}; footer capacity F1 = ${people.length * 500} cd/week = ${fmt1(people.length * 500)})`);
    log('  - ' + WEEKS.map((w, i) => (cols[i] ? `${w.slice(5)}: ${cols[i]}` : null)).filter(Boolean).join(' · '));
  }

  // 6.4 memberships and §3.3 visibility
  log('\n### 6.4 Memberships (derived: lead = LEAD, assignees = MEMBER via BR-60) and §3.3 visibility');
  const members = {};
  for (const p of G.projects) {
    members[p.name] = { [p.lead]: 'LEAD' };
    for (const t of tasks.filter((t) => t.project === p.name)) members[p.name][t.assignee] ??= 'MEMBER';
  }
  facts.members = members;
  for (const [pn, m] of Object.entries(members)) log(`- ${pn}: ${Object.entries(m).map(([u, r]) => `${u} (${r})`).join(', ')}`);
  const projectsOf = (nick) => Object.keys(members).filter((pn) => members[pn][nick]);
  const isLead = (nick) => Object.values(members).some((m) => m[nick] === 'LEAD');
  const visibleUsers = (viewer) => {
    const u = userByNick.get(viewer);
    if (u.role === 'manager' || isLead(viewer)) return users.map((x) => x.nickname);
    const mine = projectsOf(viewer);
    return users.map((x) => x.nickname).filter((n) => n === viewer || mine.some((pn) => members[pn][n]));
  };
  facts.visibility = {};
  log('\n| viewer | role | LEAD of | member of | sees totals of | sees details (names) of projects |');
  log('|---|---|---|---|---|---|');
  for (const v of users) {
    const n = v.nickname;
    const detail = v.role === 'manager' ? Object.keys(members) : projectsOf(n);
    facts.visibility[n] = { users: visibleUsers(n), detailProjects: detail };
    log(`| ${n} | ${v.role} | ${Object.keys(members).filter((pn) => members[pn][n] === 'LEAD').join(', ') || '—'} | ${projectsOf(n).join(', ') || '— (manager sees all)'} | ${visibleUsers(n).join(', ')} | ${detail.join(', ')} |`);
  }
  log('\nMasked rows ("งานในโปรเจคอื่น") a viewer would get on /people/<target> (non-empty weeks only):');
  facts.masking = [];
  for (const viewer of users.map((u) => u.nickname)) {
    const vu = userByNick.get(viewer);
    for (const target of visibleUsers(viewer)) {
      if (target === viewer || vu.role === 'manager') continue;
      const hidden = F1.allocs.filter((a) => a.user === target && !projectsOf(viewer).includes(a.project));
      if (!hidden.length) continue;
      const byWeek = {}; for (const a of hidden) byWeek[a.weekStart] = (byWeek[a.weekStart] ?? 0) + a.cd;
      const hiddenNames = [...new Set(hidden.flatMap((a) => [a.project, a.task]))];
      facts.masking.push({ viewer, target, byWeek, mustNotContain: hiddenNames });
      log(`- ${viewer} → /people/${target}: masked ${Object.entries(byWeek).map(([w, c]) => `${w.slice(5)}:${c}`).join(' ')} — JSON must NOT contain: ${hiddenNames.map((s) => `"${s}"`).join(', ')}`);
    }
  }
  log('\nProject list / clients visible per viewer (§3.2 rows "เห็นโปรเจคในลิสต์" and "ดูลูกค้า"); every other project URL → 404:');
  facts.projectAccess = {};
  for (const v of users) {
    const n = v.nickname;
    const projs = v.role === 'manager' ? G.projects.map((p) => p.name) : projectsOf(n);
    const clients = v.role === 'manager' ? G.clients : [...new Set(projs.map((pn) => projByName.get(pn).client))];
    const hidden = G.projects.map((p) => p.name).filter((pn) => !projs.includes(pn));
    facts.projectAccess[n] = { projects: projs, clients, notFound: hidden };
    log(`- ${n}: projects [${projs.join(', ')}] · clients [${clients.join(', ')}] · 404: [${hidden.join(', ') || '—'}]`);
  }
  const invisible = [];
  for (const v of users) for (const t of users) if (!visibleUsers(v.nickname).includes(t.nickname)) invisible.push(`${v.nickname}→${t.nickname}`);
  log(`\nPairs where the viewer may NOT see the target's workload at all (expect 404 on /people/<target> and no row in /workload): ${invisible.join(', ')}`);
  facts.invisiblePairs = invisible;

  // 6.5 today windows
  log(`\n### 6.5 "Today" = ${TODAY} (${EN_DOW[isoWeekday(TODAY)]}) → this week ${weekStart(TODAY)}`);
  const tw = weekStart(TODAY);
  const idx = WEEKS.indexOf(tw);
  log(`- index of this week in weekStarts: ${idx} (0-based) → ${idx} weeks of history before it, ${WEEKS.length - idx - 1} after`);
  const w12 = weekRange(tw, addDays(tw, 7 * 12)); const w8 = weekRange(tw, addDays(tw, 7 * 8)); const w4 = weekRange(tw, addDays(tw, 7 * 4));
  log(`- /workload default 12 weeks from this week: ${w12[0]}..${w12[11]} (golden weeks ${WEEKS.filter((w) => !w12.includes(w) && w > tw).join(', ')} are to the right, off-screen initially)`);
  log(`- home "ภาระของฉัน 8 สัปดาห์": ${w8[0]}..${w8[7]}`);
  log(`- FR-1007 badge "4 สัปดาห์ข้างหน้า": ${w4.join(', ')} (if it includes this week) or ${weekRange(addDays(tw, 7), addDays(tw, 35)).join(', ')} (if it starts next week)`);
  facts.today = { today: TODAY, thisWeek: tw, nextWeek: addDays(tw, 7), w12, w8, w4 };
  log('\nHome "my load 8 weeks" (total cd) per user from this week (F1):');
  for (const n of users.map((u) => u.nickname)) log(`- ${n}: ${w8.map((w) => F1.load(n, w).totalCd).join(', ')}`);
  log('\n"งานของฉันสัปดาห์นี้" (week ' + tw + ') and /my grouping (this week / next week / later / unplanned) per user (F1):');
  for (const n of users.map((u) => u.nickname)) {
    const my = tasks.filter((t) => t.assignee === n);
    const groups = { thisWeek: [], nextWeek: [], later: [], pastOnly: [] };
    for (const t of my) {
      const ks = Object.keys(t.allocationsCd).filter((k) => k >= tw).sort();
      const label = `${t.name} (${t.project})`;
      if (!ks.length) groups.pastOnly.push(label);
      else if (ks[0] === tw) groups.thisWeek.push(`${label} ${fmtD(t.allocationsCd[tw])} d`);
      else if (ks[0] === addDays(tw, 7)) groups.nextWeek.push(label);
      else groups.later.push(`${label} from ${ks[0]}`);
    }
    log(`- ${n}: this week [${groups.thisWeek.join('; ')}] · next week [${groups.nextWeek.join('; ')}] · later [${groups.later.join('; ')}]${groups.pastOnly.length ? ' · past-only [' + groups.pastOnly.join('; ') + ']' : ''}`);
  }
  // team utilisation 4 weeks
  for (const key of ['F1', 'F2', 'F3', 'F4']) {
    const S = FIX[key];
    const load = w4.reduce((s, w) => s + users.reduce((t, u) => t + S.load(u.nickname, w).totalCd, 0), 0);
    const loadC = w4.reduce((s, w) => s + users.reduce((t, u) => t + S.load(u.nickname, w).committedCd, 0), 0);
    const capAll = w4.reduce((s, w) => s + users.reduce((t, u) => t + S.cap(u.nickname, w), 0), 0);
    const capWorkers = w4.reduce((s, w) => s + users.filter((u) => u.role !== 'manager').reduce((t, u) => t + S.cap(u.nickname, w), 0), 0);
    const pct = (a, b) => `${Math.floor((a * 1000) / b + 0.5) / 10}%`;
    log(`- ${key} team utilisation ${w4[0]}..${w4[3]}: total ${load} / cap(all 6 users) ${capAll} = ${pct(load, capAll)}; / cap(5 workers, excl. Manager) ${capWorkers} = ${pct(load, capWorkers)}; committed ${loadC} → ${pct(loadC, capAll)} / ${pct(loadC, capWorkers)}`);
  }

  // 6.6 colours BR-45
  log('\n### 6.6 BR-45 colour of every non-empty cell ("ทั้งหมด" view uses total; "แน่นอน" view uses committed)');
  facts.colors = {};
  for (const key of ['F1', 'F2', 'F3', 'F4']) {
    const S = FIX[key];
    const cells = S.cells();
    const cnt = (view) => { const c = {}; for (const x of cells) { const col = color(view === 'total' ? x.totalCd : x.committedCd, x.capacityCd); c[col] = (c[col] ?? 0) + 1; } return c; };
    const greens = cells.filter((x) => color(x.totalCd, x.capacityCd) === 'GREEN').map((x) => `${x.user} ${x.week.slice(5)}`);
    const reds = cells.filter((x) => color(x.totalCd, x.capacityCd) === 'RED').map((x) => `${x.user} ${x.week.slice(5)} (${x.totalCd}/${x.capacityCd}, ${x.level})`);
    facts.colors[key] = { total: cnt('total'), committed: cnt('committed'), reds, greens };
    log(`- ${key}: total-view ${JSON.stringify(cnt('total'))}; committed-view ${JSON.stringify(cnt('committed'))} (108 cells = 6 users × 18 weeks)`);
    log(`  - RED (total view): ${reds.join(', ') || 'none'}`);
    if (key !== 'F1') {
      const f1g = new Set(facts.colors.F1.greens);
      const changed = cells.filter((x) => color(x.totalCd, x.capacityCd) !== color(x.totalCd, 500) && x.totalCd > 0).map((x) => `${x.user} ${x.week.slice(5)}: ${color(x.totalCd, 500)}→${color(x.totalCd, x.capacityCd)} (${x.totalCd}/${x.capacityCd})`);
      log(`  - colour changes vs F1: ${changed.join(', ') || 'none'}`);
    } else log(`  - GREEN cells (= total 500): ${greens.join(', ')}`);
  }

  // 6.7 day-level (M7) derived distribution and overload for affected weeks
  log('\n### 6.7 Day-level view of the affected weeks (BR-21 derived values, BR-40 per day)');
  facts.dayLevel = {};
  const affected = { F1: [['Ivy', '2026-09-28'], ['Peter', '2026-10-12']], F2: [['Jack', '2026-10-19'], ['Mint', '2026-10-19'], ['Peter', '2026-10-19'], ['Cindy', '2026-10-19'], ['Ivy', '2026-10-19']], F3: [['Peter', '2026-10-05']], F4: [['Cindy', '2026-10-12']] };
  for (const [key, list] of Object.entries(affected)) {
    const S = FIX[key];
    for (const [n, ws] of list) {
      const alloc = S.allocs.filter((a) => a.user === n && a.weekStart === ws);
      const wk = alloc.reduce((s, a) => s + a.cd, 0);
      const committedWk = alloc.filter((a) => a.cert === 'CONFIRMED').reduce((s, a) => s + a.cd, 0);
      const { days, caps, values, warnNonWorking } = S.derivedDays(n, ws, wk);
      const perDay = days.map((d, i) => {
        const cd = values[i]; const cap = caps[i]; const std = userByNick.get(n).schedule[isoWeekday(d)] ?? 0;
        const o = overload({ totalCd: cd, committedCd: committedWk === wk ? cd : 0, capacityCd: cap, standardCd: std });
        return { date: d, dow: EN_DOW[isoWeekday(d)], capCd: cap, derivedCd: cd, level: o.level, excessCd: o.excessCd ?? 0, cause: o.cause ?? null };
      });
      facts.dayLevel[`${key}|${n}|${ws}`] = perDay;
      log(`- ${key} ${n} week ${ws} (${wk} cd, ${committedWk === wk ? 'CONFIRMED' : 'TENTATIVE'}; week cap ${S.cap(n, ws)}):`);
      log('  - ' + perDay.filter((p) => isoWeekday(p.date) <= 5).map((p) => `${p.dow} ${p.date.slice(5)} cap ${p.capCd} → ${p.derivedCd} (${fmt1(p.derivedCd) || '—'})${p.level !== 'OK' ? ` ${p.level}+${p.excessCd} ${p.cause}` : ''}`).join(' · ') + (warnNonWorking ? ' ⚠ BR-21a' : ''));
      const over100 = perDay.filter((p) => p.derivedCd > 100);
      if (over100.length) log(`  - ⚠ ${over100.length} derived day value(s) > 100 cd → BR-22 (WEEK→DAY on edit) would have to write DAY rows > 1.00, which BR-26 / DDL check (person_days <= 1 for DAY) forbid`);
    }
  }

  // 6.8 AC examples
  log('\n### 6.8 Acceptance-criteria example numbers');
  {
    // AC-802
    const S = FIX.F3; const cap = S.cap('Peter', '2026-10-05');
    log(`- AC-802 (F3): Peter week 2026-10-05 capacity ${cap} cd → key "f" writes ${cap} (${fmt1(cap)} d), key "h" writes ${cap / 2} (${fmt1(cap / 2)} d); before: DW "ย้าย pipeline ขึ้น BigQuery" = 500 (5.0), OVER +200 CAPACITY`);
    const after = overload({ totalCd: cap, committedCd: cap, capacityCd: cap, standardCd: 500 });
    log(`  - after "f": total ${cap}/${cap} → ${after.level}, colour ${color(cap, cap)}; F3 overload list becomes empty; DW total 3000→${3000 - 500 + cap}, F1-style grand total 19500→${19500 - 500 + cap}, committed 11625→${11625 - 500 + cap}`);
    log(`  - same key under F1 (no leave) writes 500 (no change); under F2 on Jack/Mint 2026-10-19 writes ${FIX.F2.cap('Jack', '2026-10-19')}; under F4 on Cindy 2026-10-12 writes ${FIX.F4.cap('Cindy', '2026-10-12')}`);
    // AC-801
    const cindyPOS = tasks.find((t) => t.name === 'ปรับปรุงระบบ POS หน้าร้าน');
    const cindyCRM = tasks.find((t) => t.name === 'ย้ายข้อมูลลูกค้า');
    const scen801 = (taskObj, from) => {
      const ws6 = weekRange(from, addDays(from, 42));
      const res = ws6.map((w) => {
        const other = F1.allocs.filter((a) => a.user === 'Cindy' && a.weekStart === w && a.task !== taskObj.name);
        const tot = 300 + other.reduce((s, a) => s + a.cd, 0);
        const com = (effectiveCertainty(taskObj) === 'CONFIRMED' ? 300 : 0) + other.filter((a) => a.cert === 'CONFIRMED').reduce((s, a) => s + a.cd, 0);
        const o = overload({ totalCd: tot, committedCd: com, capacityCd: 500, standardCd: 500 });
        return `${w.slice(5)}: ${taskObj.allocationsCd[w] ?? 0}→300 (Cindy total ${tot}${o.level !== 'OK' ? ' ' + o.level + '+' + o.excessCd : ''})`;
      });
      const before = ws6.reduce((s, w) => s + (taskObj.allocationsCd[w] ?? 0), 0);
      return `${res.join(' · ')} — task sum ${Object.values(taskObj.allocationsCd).reduce((a, b) => a + b, 0)}→${Object.values(taskObj.allocationsCd).reduce((a, b) => a + b, 0) - before + 1800}`;
    };
    log(`- AC-801 option A (POS grid, Cindy row, 6 weeks from 2026-08-31): ${scen801(cindyPOS, '2026-08-31')}`);
    log(`- AC-801 option B (POS grid, Cindy row, 6 weeks from this week 2026-09-28): ${scen801(cindyPOS, '2026-09-28')}`);
    log(`- AC-801 option C (CRM grid, Cindy row, 6 weeks from 2026-10-05): ${scen801(cindyCRM, '2026-10-05')}`);
    // AC-804
    for (const ws of ['2026-09-28', '2026-10-19']) {
      for (const key of ['F1', 'F2']) {
        const S = FIX[key];
        const { days, values } = S.derivedDays('Ivy', ws, 250);
        const wed = addDays(ws, 2);
        const after = days.map((d, i) => (d === wed ? 100 : values[i]));
        const dayRows = days.map((d, i) => [d, after[i]]).filter(([, v]) => v > 0);
        log(`- AC-804 ${key} Ivy week ${ws}: derived ${values.slice(0, 5).map((v) => fmt1(v) || '—').join(' / ')} → set Wed ${wed} = 1.0 → DAY rows ${dayRows.map(([d, v]) => `${d.slice(5)}:${v}`).join(' ')} = ${after.reduce((a, b) => a + b, 0)} cd (${fmt1(after.reduce((a, b) => a + b, 0))})`);
      }
    }
    // BR-24 scale example on the AC-804 result
    const dayVals = [50, 50, 100, 50, 50];
    for (const target of [400, 350, 200]) {
      const sc = distributeExact(target, dayVals);
      log(`- BR-24 SCALE of Ivy 2026-09-28 DAY [${dayVals}] (=300) to ${target}: [${sc}]${sc.some((v) => v > 100) ? '  ⚠ contains a DAY value > 100 cd (violates BR-26 / DDL check)' : ''}`);
    }
    // BR-25 examples
    const plan = (nick, n, start, end) => {
      const days = []; for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
      const caps = days.map((d) => F1.dayCap(nick, d));
      const vals = distributeExact(n * 100, caps);
      const byWeek = {};
      days.forEach((d, i) => { const w = weekStart(d); (byWeek[w] ??= []).push([d, vals[i]]); });
      const parts = Object.entries(byWeek).map(([w, list]) => {
        const whole = start <= w && addDays(w, 6) <= end;
        const sum = list.reduce((s, [, v]) => s + v, 0);
        return whole ? `WEEK ${w}=${sum}` : `DAY ${list.filter(([, v]) => v > 0).map(([d, v]) => `${d.slice(5)}:${v}`).join(' ')}`;
      });
      return parts.join(' | ');
    };
    log(`- BR-25/FR-612 Ivy 10 d over 2026-11-11..2026-11-24 (F1, Ivy free those weeks? load ${['2026-11-09', '2026-11-16', '2026-11-23'].map((w) => F1.load('Ivy', w).totalCd)}): ${plan('Ivy', 10, '2026-11-11', '2026-11-24')}`);
    log(`- BR-25/FR-612 Ivy 5 d over 2026-11-11..2026-11-24: ${plan('Ivy', 5, '2026-11-11', '2026-11-24')}`);
    log(`- BR-25/FR-612 Ivy 2 d over 2026-11-11..2026-11-13 (remainder case): ${plan('Ivy', 2, '2026-11-11', '2026-11-13')}`);
    log(`- BR-25/FR-612 Ivy 4 d over 2026-11-11..2026-11-13 (more than capacity): ${plan('Ivy', 4, '2026-11-11', '2026-11-13')}  ⚠ DAY values > 100`);
    // headroom
    log('\nFree capacity (500 − total) per user-week in F1 where the user has NO allocation (clean cells for e2e writes):');
    for (const u of users) log(`- ${u.nickname}: ${WEEKS.filter((w) => F1.load(u.nickname, w).totalCd === 0).map((w) => w.slice(5)).join(', ')}`);
  }

  // 6.9 BR-13 deactivation example (AC-203 + BR-13)
  log('\n### 6.9 BR-13 example: deactivate Cindy on 2026-09-30 (inclusive)');
  {
    const S = scenario({ deactivated: { Cindy: '2026-09-30' } });
    const ov = S.overloads();
    for (const o of ov) log(`- ${o.user} ${o.week} ${o.level} +${o.excessCd} ${o.cause} (total ${o.totalCd}, committed ${o.committedCd}, cap ${o.capacityCd})`);
    facts.deactivateCindy = ov;
  }

  // 6.10 combined / cumulative fixtures
  log('\n### 6.10 Combined fixtures');
  const setupsAll = { holidays: G.expected.F2.setup.holidays, timeOff: [...G.expected.F3.setup.timeOff, ...G.expected.F4.setup.timeOff] };
  const comb = {
    'F2+F3 (= §8.5 mock state)': { holidays: G.expected.F2.setup.holidays, timeOff: G.expected.F3.setup.timeOff },
    'F2+F3+F4 (all at once)': setupsAll,
    'demo (A.2: Peter leave, no holiday) + Kickoff workshop DAY 09-07 Jack/Mint 50': { timeOff: G.expected.F3.setup.timeOff },
  };
  facts.combined = {};
  for (const [label, setup] of Object.entries(comb)) {
    const extra = label.startsWith('demo') ? [
      { user: 'Jack', project: 'Mobile App Revamp', task: 'Kickoff workshop', granularity: 'DAY', period: '2026-09-07', weekStart: '2026-09-07', cd: 50, cert: 'CONFIRMED' },
      { user: 'Mint', project: 'Mobile App Revamp', task: 'Kickoff workshop', granularity: 'DAY', period: '2026-09-07', weekStart: '2026-09-07', cd: 50, cert: 'CONFIRMED' },
    ] : [];
    const S = scenario(setup, extra);
    const ov = S.overloads();
    const tot = S.allocs.reduce((s, a) => s + a.cd, 0); const com = S.allocs.filter((a) => a.cert === 'CONFIRMED').reduce((s, a) => s + a.cd, 0);
    facts.combined[label] = { overloads: ov, totalCd: tot, committedCd: com };
    log(`- ${label}: total ${tot}, committed ${com}; overloads ${ov.map((o) => `${o.user} ${o.week} ${o.level}+${o.excessCd} ${o.cause}`).join(' · ')}`);
    if (label.startsWith('demo')) log(`  - demo: Jack 09-07 = ${S.load('Jack', '2026-09-07').totalCd}, Mint 09-07 = ${S.load('Mint', '2026-09-07').totalCd}; Mobile total 5875→${S.allocs.filter((a) => a.project === 'Mobile App Revamp').reduce((s, a) => s + a.cd, 0)}`);
  }

  // 6.11 milestones in A.2 (BR-70 status on TODAY; BR-71 late for UAT sign-off)
  log(`\n### 6.11 A.2 demo milestones: BR-70 status on ${TODAY}, week column, BR-71 lateness`);
  const ms = [['POS', 'UAT sign-off', '2026-10-02', 'ทำ UAT + คู่มือหน้าร้าน'], ['POS', 'Go-live สาขาแรก', '2026-12-21', null], ['DW', 'Pipeline พร้อมใช้งาน', '2026-10-23', null], ['Mobile', 'Design freeze', '2026-10-09', null], ['Mobile', 'Beta release', '2026-11-13', null], ['CRM', 'Data migration complete', '2026-11-06', null], ['Store', 'Dashboard v1 review', '2026-12-11', null]];
  facts.milestones = [];
  for (const [p, name, date, bound] of ms) {
    const dd = diffDays(date, TODAY);
    const status = dd < 0 ? 'OVERDUE' : dd <= 7 ? 'DUE_SOON' : 'UPCOMING';
    let late = null;
    if (bound) { const t = tasks.find((x) => x.name === bound); late = Object.keys(t.allocationsCd).filter((w) => w > date); }
    facts.milestones.push({ p, name, date, status, week: weekStart(date), dow: EN_DOW[isoWeekday(date)], daysFromToday: dd, within14: dd >= 0 && dd <= 14, lateWeeks: late });
    log(`- ${p} › ${name} ${date} (${EN_DOW[isoWeekday(date)]}, grid week ${weekStart(date)}): ${dd} d from today → ${status}${dd >= 0 && dd <= 14 ? ' · in home "14 days" card' : ''}${bound ? ` · bound to "${bound}" → late weeks (week_start > date): ${late.join(', ') || 'none'}` : ''}`);
  }
  log('- tasks with plan in week 2026-10-26 (AC-702 candidates, week_start 10-26 > a 10-23 milestone): ' + F1.allocs.filter((a) => a.weekStart === '2026-10-26').map((a) => `${a.task} (${a.project}, ${a.user} ${a.cd})`).join('; '));
}

// ───────────────────────── 6b. badges, manager card, FR-906, synthetic causes ─────────────────────────
h('6b. Badges (FR-1007), manager home card, FR-906 impact, synthetic WORKLOAD/BOTH cases');
{
  const tw = weekStart(TODAY);
  const winA = weekRange(tw, addDays(tw, 28)); const winB = weekRange(addDays(tw, 7), addDays(tw, 35));
  const members = facts.members;
  const projectsOf = (nick) => Object.keys(members).filter((pn) => members[pn][nick]);
  const isLead = (nick) => Object.values(members).some((m) => m[nick] === 'LEAD');
  const visible = (viewer) => { const u = userByNick.get(viewer); if (u.role === 'manager' || isLead(viewer)) return users.map((x) => x.nickname); const mine = projectsOf(viewer); return users.map((x) => x.nickname).filter((n) => n === viewer || mine.some((pn) => members[pn][n])); };
  const demoSetup = { timeOff: G.expected.F3.setup.timeOff };
  const scen = { F1: FIX.F1, F2: FIX.F2, F3: FIX.F3, F4: FIX.F4, 'F2+F3': scenario({ holidays: G.expected.F2.setup.holidays, timeOff: G.expected.F3.setup.timeOff }), demo: scenario(demoSetup) };
  facts.badges = {};
  for (const [key, S] of Object.entries(scen)) {
    const ov = S.overloads().filter((o) => o.level === 'OVER');
    const row = users.map((v) => {
      const vis = visible(v.nickname);
      const a = ov.filter((o) => winA.includes(o.week) && vis.includes(o.user)).length;
      const b = ov.filter((o) => winB.includes(o.week) && vis.includes(o.user)).length;
      return `${v.nickname} ${a}${a !== b ? '/' + b : ''}`;
    });
    facts.badges[key] = row;
    const mgr = S.overloads().filter((o) => [tw, addDays(tw, 7)].includes(o.week)).map((o) => `${o.user} ${o.week} ${o.level}`);
    log(`- ${key}: FR-1007 badge per viewer (window incl. this week${'/'}window from next week when different): ${row.join(' · ')}; manager card "ล้นสัปดาห์นี้+หน้า": ${mgr.join(', ') || 'none'}`);
  }
  // FR-906: impact after saving the leave
  for (const key of ['F3', 'F4']) {
    const t = G.expected[key].setup.timeOff[0];
    const weeks = [...new Set([weekStart(t.startDate), weekStart(t.endDate)])];
    for (const w of weeks) {
      const before = F1.cap(t.user, w), after = FIX[key].cap(t.user, w);
      const newOv = FIX[key].overloads().filter((o) => o.user === t.user && o.week === w);
      log(`- FR-906 ${key}: ${t.user} leave ${t.startDate}..${t.endDate} → week ${w} capacity ${fmtD(before)} → ${fmtD(after)} d (${before}→${after} cd); new: ${newOv.map((o) => `${o.level} +${fmtD(o.excessCd)} ${o.cause}`).join(', ') || 'none'}`);
    }
  }
  // synthetic cause cases built on golden weeks
  const cases = [
    ['WORKLOAD / OVER: F1 + 125 cd CONFIRMED extra for Jack 2026-10-05', {}, [{ user: 'Jack', cd: 125, cert: 'CONFIRMED', week: '2026-10-05' }]],
    ['WORKLOAD / RISK: F1 + 250 cd TENTATIVE extra for Cindy 2026-10-19', {}, [{ user: 'Cindy', cd: 250, cert: 'TENTATIVE', week: '2026-10-19' }]],
    ['BOTH / OVER (committed < total): F2 + 125 cd TENTATIVE extra for Jack 2026-10-19', G.expected.F2.setup, [{ user: 'Jack', cd: 125, cert: 'TENTATIVE', week: '2026-10-19' }]],
    ['BOTH / RISK: F4 + 300 cd TENTATIVE extra for Cindy 2026-10-12', G.expected.F4.setup, [{ user: 'Cindy', cd: 300, cert: 'TENTATIVE', week: '2026-10-12' }]],
    ['boundary load = cap → OK: F2 with Jack 2026-10-19 reduced to 400 (key "f")', G.expected.F2.setup, [{ user: 'Jack', cd: -100, cert: 'CONFIRMED', week: '2026-10-19' }]],
  ];
  facts.synthetic = [];
  for (const [label, setup, extra] of cases) {
    const S = scenario(setup, extra.map((e) => ({ user: e.user, project: 'synthetic', task: 'synthetic', granularity: 'WEEK', period: e.week, weekStart: e.week, cd: e.cd, cert: e.cert })));
    const e = extra[0];
    const l = S.load(e.user, e.week); const c = { ...l, capacityCd: S.cap(e.user, e.week), standardCd: S.std(e.user, e.week) };
    const o = overload(c);
    facts.synthetic.push({ label, ...c, ...o });
    log(`- ${label}: total ${c.totalCd}, committed ${c.committedCd}, cap ${c.capacityCd}, standard ${c.standardCd} → ${o.level}${o.level !== 'OK' ? ` +${o.excessCd} ${o.cause}` : ''}${o.level === 'OVER' && c.committedCd !== c.totalCd ? ` (excess = committed − cap; total − cap would be ${c.totalCd - c.capacityCd})` : ''}`);
  }
}

// ───────────────────────── 7. SPEC UI mock cross-checks ─────────────────────────
h('7. SPEC §8 UI mock numbers vs data (illustrative mocks; informative)');
{
  const F2S = FIX.F2; const F23 = scenario({ holidays: G.expected.F2.setup.holidays, timeOff: G.expected.F3.setup.timeOff });
  // §8.3 POS grid
  const cols = ['2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19'];
  const posRow = (name) => cols.map((w) => fmt1(tasks.find((t) => t.name === name).allocationsCd[w] ?? 0));
  const mock = { 'ปรับปรุงระบบ POS หน้าร้าน': ['3.8', '2.5', '2.5', '', '', ''], 'ทำ UAT + คู่มือหน้าร้าน': ['2.5', '2.5', '2.5', '1.3', '', ''], 'Rollout สาขา': ['', '', '', '', '', ''] };
  for (const [n, m] of Object.entries(mock)) check(JSON.stringify(posRow(n)) === JSON.stringify(m), `§8.3 POS grid row "${n}" 14/9..19/10 = [${posRow(n)}] (mock [${m}])`);
  const sums = { 'ปรับปรุงระบบ POS หน้าร้าน': '18.8', 'ทำ UAT + คู่มือหน้าร้าน': '8.8', 'Rollout สาขา': '18.8' };
  for (const [n, s] of Object.entries(sums)) { const v = Object.values(tasks.find((t) => t.name === n).allocationsCd).reduce((a, b) => a + b, 0); check(fmt1(v) === s, `§8.3 "รวม" ${n} = ${v} cd → ${fmt1(v)} (mock ${s})`); }
  const footer = cols.map((w) => fmt1(F1.allocs.filter((a) => a.project === 'POS Upgrade' && a.weekStart === w).reduce((s, a) => s + a.cd, 0)));
  check(JSON.stringify(footer) === JSON.stringify(['6.3', '5.0', '5.0', '1.3', '', '']), `§8.3 footer ภาระรวม (POS only) = [${footer}] (mock [6.3,5.0,5.0,1.3,,])`);
  const capF2 = cols.map((w) => fmt1(['Cindy', 'Ivy', 'Mint'].reduce((s, n) => s + F2S.cap(n, w), 0)));
  const capF1 = cols.map((w) => fmt1(['Cindy', 'Ivy', 'Mint'].reduce((s, n) => s + F1.cap(n, w), 0)));
  check(JSON.stringify(capF2) === JSON.stringify(['15.0', '15.0', '15.0', '15.0', '15.0', '12.0']), `§8.3 footer Capacity (Cindy+Ivy+Mint) under F2 = [${capF2}] (mock ends with 12.0 → the mock assumes the F2 holiday; under F1 it is [${capF1}])`);
  const ms = weekStart('2026-10-02');
  check(ms === '2026-09-28', `§8.3 ◆UAT (2026-10-02) sits in column 28/9 (weekStart = ${ms})`);
  // §8.4 day expansion 19 ต.ค. under F2
  const jack = F2S.derivedDays('Jack', '2026-10-19', 500).values.slice(0, 5).map(fmt1);
  const path = F2S.derivedDays('Peter', '2026-10-19', 250).values.slice(0, 5).map(fmt1);
  check(JSON.stringify(path) === JSON.stringify(['0.6', '0.6', '0.6', '0.6', '']), `§8.4 Peter 19 ต.ค. derived (F2) = [${path}] (mock ╌0.6 ×4 + holiday) — exact cd ${F2S.derivedDays('Peter', '2026-10-19', 250).values.slice(0, 5)}`);
  check(JSON.stringify(jack) === JSON.stringify(['1.0', '1.0', '1.0', '1.0', '']), `§8.4 Jack 19 ต.ค. derived (F2) = [${jack}] (mock shows solid 1.0 ×4) — exact cd ${F2S.derivedDays('Jack', '2026-10-19', 500).values.slice(0, 5)}`);
  check(F1.load('Jack', '2026-10-12').totalCd === 500 && F1.load('Peter', '2026-10-12').totalCd === 375 && F1.load('Jack', '2026-10-26').totalCd === 250 && F1.load('Peter', '2026-10-26').totalCd === 0, '§8.4 neighbours: Jack 12/10 5.0, Peter 12/10 3.8, Jack 26/10 2.5, Peter 26/10 empty');
  // §8.5 workload mock (Jack, Peter; 28/9..26/10) under F2+F3
  const wcols = ['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'];
  const cell = (n, w) => { const l = F23.load(n, w).totalCd; const c = F23.cap(n, w); if (l === 0) return '–'; const o = overload({ totalCd: l, committedCd: F23.load(n, w).committedCd, capacityCd: c, standardCd: 500 }); const f = (x) => (x % 100 === 0 ? String(x / 100) : fmt1(x)); return `${f(l)}/${f(c)}${o.level === 'OVER' ? '🔴' : ''}`; };
  const jackRow = wcols.map((w) => cell('Jack', w)); const pathRow = wcols.map((w) => cell('Peter', w));
  check(JSON.stringify(jackRow) === JSON.stringify(['3.8/5', '5/5', '5/5', '5/4🔴', '2.5/5']), `§8.5 Jack row (F2+F3) = [${jackRow}] (mock [3.8/5, 5/5, 5/5, 5/4🔴, 2.5/5])`);
  check(JSON.stringify(pathRow) === JSON.stringify(['5/5', '5/3🔴', '3.8/5', '2.5/4', '–']), `§8.5 Peter row (F2+F3) = [${pathRow}] (mock [5/5, 5/3🔴, 3.8/5, 2.5/4, –])`);
  check(F23.overloads().length === 3, `§8.5 "รายการที่ล้น (3)" = number of overloads under F2+F3 = ${F23.overloads().length}`);
  // §8.2 home mock for Cindy
  const cindy8 = weekRange('2026-09-28', addDays('2026-09-28', 56)).map((w) => F1.load('Cindy', w).totalCd);
  check(JSON.stringify(cindy8) === JSON.stringify([250, 250, 250, 375, 375, 250, 0, 0]), `§8.2 Cindy 8-week bars ▅▅ ▅▅ ▅▅ ▇▇ ▇▇ ▅▅ ▁▁ ▁▁ ↔ [${cindy8}]`);
  check(isoWeekday('2026-09-30') === 3, '§8.2 "พุธ 30 ก.ย. 2569" — 2026-09-30 is a Wednesday (BE 2569 = CE 2026 + 543)');
  check(F1.load('Cindy', '2026-09-28').totalCd === 250, '§8.2 "ปรับปรุงระบบ POS … 2.5 วัน" this week for Cindy = 250 cd');
  const cindySeesMobile = ['POS Upgrade', 'CRM Migration'].includes('Mobile App Revamp');
  check(cindySeesMobile, '§8.2 mock lists "◆ 9 ต.ค. Design freeze · Mobile" on Cindy\'s home, but Cindy is not a member of Mobile App Revamp (member of POS, CRM only) → §3.3 says milestones of projects without access are hidden');
}

// ───────────────────────── 8. distribute(): SPEC float version vs integer-exact ─────────────────────────
h('8. distribute(): SPEC sample (float) vs integer-exact largest remainder');
{
  let n = 0, diff = 0, sumBad = 0; const ex = [];
  const vals = [0, 50, 100];
  for (let t = 1; t <= 700; t++) for (let mask = 0; mask < 243; mask++) {
    const w = []; let m = mask; for (let i = 0; i < 5; i++) { w.push(vals[m % 3]); m = Math.floor(m / 3); } w.push(0, 0);
    if (w.every((x) => x === 0)) continue; // sumW = 0 → returns zeros by design (caller applies BR-21a fallback)
    const a = distributeSpecFloat(t, w), b = distributeExact(t, w); n++;
    if (a.reduce((x, y) => x + y, 0) !== t) sumBad++;
    if (JSON.stringify(a) !== JSON.stringify(b)) { diff++; if (ex.length < 3) ex.push({ t, w, a, b }); }
  }
  check(diff === 0 && sumBad === 0, `weights ⊂ {0,50,100} (full/half days), t = 1..700: ${n} cases, float≠exact in ${diff}, sum≠t in ${sumBad}`);
  let n2 = 0, diff2 = 0; const ex2 = [];
  let seed = 12345; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let k = 0; k < 300000; k++) {
    const len = 1 + Math.floor(rnd() * 7);
    const w = Array.from({ length: len }, () => 1 + Math.floor(rnd() * 100));
    const t = 1 + Math.floor(rnd() * 700);
    const a = distributeSpecFloat(t, w), b = distributeExact(t, w); n2++;
    if (JSON.stringify(a) !== JSON.stringify(b)) { diff2++; if (ex2.length < 3) ex2.push({ t, w, float: a, exact: b }); }
  }
  log(`  INFO  random weights 1..100 (part-time schedules, numeric(3,2) fractions): ${n2} cases, float≠exact in ${diff2}; examples: ${JSON.stringify(ex2)}`);
  const d1 = distributeSpecFloat(50, [10, 40, 100]); const d2 = distributeExact(50, [10, 40, 100]);
  log(`  INFO  distribute(50,[10,40,100]): SPEC float → [${d1}], exact → [${d2}] (all three fractional parts are exactly 1/3 — tie must go to the earliest day)`);
  const d3 = distributeSpecFloat(100, [25, 75, 100, 100]); const d4 = distributeExact(100, [25, 75, 100, 100]);
  log(`  INFO  distribute(100,[25,75,100,100]): SPEC float → [${d3}], exact → [${d4}]`);
  facts.distributeMismatch = { fullHalfDays: diff, random: { cases: n2, mismatches: diff2, examples: ex2 }, ex1: { float: d1, exact: d2 }, ex2: { float: d3, exact: d4 } };
}

// ───────────────────────── 9. display rounding helpers ─────────────────────────
h('9. Display rounding (SPEC §8.8: 1 decimal in grid) — float formatting pitfalls');
{
  const probes = [375, 125, 625, 1875, 35, 45, 105, 115, 145, 1005, 63, 62, 167, 166];
  for (const cd of probes) {
    const tf = (cd / 100).toFixed(1);
    const intl = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(cd / 100);
    log(`  INFO  ${cd} cd → integer half-up "${fmt1(cd)}" · (cd/100).toFixed(1) "${tf}" · Intl(max 1) "${intl}"${tf !== fmt1(cd) || intl !== fmt1(cd) ? '   ← differs' : ''}`);
  }
}

// ───────────────────────── summary ─────────────────────────
h('Summary');
log(`  checks failed: ${failures}`);
for (const d of discrepancies) log(`  - ${d}`);
fs.writeFileSync(path.join(HERE, 'facts.json'), JSON.stringify(facts, null, 2));
console.log(out.join('\n'));
process.exitCode = 0;
````

### 7.5 Source: `verify-excel.py`

````python
#!/usr/bin/env python3
"""verify-excel.py — cross-check docs/reference/golden-fixtures.json against its declared source,
Workload_Planner_Aug-Dec_2026_v2.xlsx (sheets Setup + Plan), and diff the v1 workbook.
Read-only; research use only (the app itself must never read .xlsx at runtime).
Requires openpyxl (python3 -c 'import openpyxl').
"""
import json, os, sys
from decimal import Decimal
from datetime import date, timedelta
import openpyxl

ROOT = os.environ.get('PLAN_ROOT', '/Users/thammasorn.har/Desktop/plan-system')
REF = os.path.join(ROOT, 'docs/reference')
G = json.load(open(os.path.join(REF, 'golden-fixtures.json'), encoding='utf-8'))
fails = []

def check(cond, msg):
    print(('  PASS  ' if cond else '  FAIL  ') + msg)
    if not cond:
        fails.append(msg)

CERT = {'แน่นอน': 'CONFIRMED', 'อาจไม่ทำ': 'TENTATIVE'}
SUFFIX = ' (ตัวอย่าง — ลบได้)'
MONTHS = {'Aug': 8, 'Sep': 9, 'Oct': 10, 'Nov': 11, 'Dec': 12}

def read_plan(path):
    wb = openpyxl.load_workbook(path, data_only=False)
    ws = wb['Plan']
    hdr_row = next(r for r in range(1, 15) if ws.cell(r, 4).value == 'Person')
    headers = {ws.cell(hdr_row, c).value: c for c in range(1, ws.max_column + 1) if ws.cell(hdr_row, c).value}
    # week columns: month label on hdr_row (only where the month changes), day number on hdr_row+1
    week_cols, month = [], None
    for c in range(1, ws.max_column + 1):
        lab = ws.cell(hdr_row, c).value
        if isinstance(lab, str) and lab in MONTHS:
            month = MONTHS[lab]
        day = ws.cell(hdr_row + 1, c).value  # int in v2, digit string in v1
        if month and (isinstance(day, int) or (isinstance(day, str) and day.isdigit())):
            week_cols.append((c, date(2026, month, int(day)).isoformat()))
    cert_col = next((c for h, c in headers.items() if isinstance(h, str) and h.startswith('ความแน่นอน')), None)
    rows = []
    for r in range(hdr_row + 2, ws.max_row + 1):
        person = ws.cell(r, 4).value
        if not person:
            continue
        alloc = {}
        for c, wk in week_cols:
            v = ws.cell(r, c).value
            if v not in (None, ''):
                cd = Decimal(str(v)) * 500
                alloc[wk] = int(cd) if cd == cd.to_integral_value() else float(cd)
        rows.append({
            'row': r, 'client': ws.cell(r, 1).value, 'project': ws.cell(r, 2).value,
            'description': ws.cell(r, 3).value, 'person': person,
            'override': ws.cell(r, cert_col).value if cert_col else None, 'allocationsCd': alloc,
        })
    setup = wb['Setup']
    people = [setup.cell(r, 2).value for r in range(5, 13) if setup.cell(r, 2).value]
    clients = [setup.cell(r, 4).value for r in range(5, 17) if setup.cell(r, 4).value]
    projects = [(setup.cell(r, 6).value, setup.cell(r, 7).value) for r in range(5, 30) if setup.cell(r, 6).value]
    return {'weeks': [w for _, w in week_cols], 'rows': rows, 'people': people, 'clients': clients, 'projects': projects,
            'cert_col': cert_col, 'sheets': wb.sheetnames}

print('## E1. v2 workbook vs golden-fixtures.json')
v2 = read_plan(os.path.join(REF, 'Workload_Planner_Aug-Dec_2026_v2.xlsx'))
check(v2['weeks'] == G['weekStarts'], f"Plan week columns F..W = {v2['weeks'][0]}..{v2['weeks'][-1]} ({len(v2['weeks'])}) == JSON weekStarts")
check(all(date.fromisoformat(w).weekday() == 0 for w in v2['weeks']), 'every Excel week column is a Monday')
check(len(v2['rows']) == 10, f"Plan has {len(v2['rows'])} data rows (rows {v2['rows'][0]['row']}..{v2['rows'][-1]['row']})")
check(v2['people'] == ['Cindy', 'Ivy', 'Peter', 'Jack', 'Mint'], f"Setup people {v2['people']} (JSON adds a 'Manager' demo user not in Excel)")
check(v2['clients'] == G['clients'], f"Setup clients {v2['clients']} == JSON clients")
proj_cert = {p: CERT.get(c or 'แน่นอน') for p, c in v2['projects']}
for p in G['projects']:
    check(proj_cert.get(p['name']) == p['certainty'], f"Setup certainty {p['name']}: {proj_cert.get(p['name'])} == JSON {p['certainty']}")
for i, r in enumerate(v2['rows']):
    name = r['description'][:-len(SUFFIX)] if r['description'].endswith(SUFFIX) else r['description']
    t = next((x for x in G['tasks'] if x['project'] == r['project'] and x['name'] == name and x['assignee'] == r['person']), None)
    ok = t is not None and t['allocationsCd'] == r['allocationsCd'] and (t['certaintyOverride'] or None) == (CERT.get(r['override']) if r['override'] else None)
    check(ok, f"row {r['row']} {r['project']} › {name} ({r['person']}{', override ' + r['override'] if r['override'] else ''}): fractions×500 == JSON allocationsCd; JSON order index {G['tasks'].index(t) if t else None} == {i}")
    proj = next(p for p in G['projects'] if p['name'] == r['project'])
    check(proj['client'] == r['client'], f"row {r['row']} client column A '{r['client']}' == JSON project.client '{proj['client']}'")
check(all(r['description'].endswith(SUFFIX) for r in v2['rows']), f"every Excel description ends with '{SUFFIX}' which the JSON strips")

# Excel semantics: capacity fixed 1.00 per person-week, OVER if committed > 1, เสี่ยง if total > 1
tot, com = {}, {}
for r in v2['rows']:
    eff = CERT.get(r['override']) if r['override'] else proj_cert[r['project']]
    for w, cd in r['allocationsCd'].items():
        k = (r['person'], w)
        tot[k] = tot.get(k, 0) + cd
        com[k] = com.get(k, 0) + (cd if eff == 'CONFIRMED' else 0)
over = [k for k in tot if com[k] > 500]
risk = [k for k in tot if tot[k] > 500 and com[k] <= 500]
check(not over and not risk, f"Excel-rule overloads (cap 1.00): OVER {len(over)}, เสี่ยง {len(risk)}; max person-week total = {max(tot.values())} cd")
check(sum(tot.values()) == G['expected']['F1']['totalCd'] and sum(com.values()) == G['expected']['F1']['committedCd'],
      f"Excel sums: total {sum(tot.values())} / committed {sum(com.values())} cd (= 39.00 / 23.25 fractions) == expected F1")

print('\n## E2. v1 workbook (Workload_Planner_Aug-Dec_2026.xlsx) vs v2')
v1 = read_plan(os.path.join(REF, 'Workload_Planner_Aug-Dec_2026.xlsx'))
print(f"  INFO  v1 sheets: {v1['sheets']}; v2 sheets: {v2['sheets']}")
print(f"  INFO  v1 certainty column present: {bool(v1['cert_col'])}; v1 Setup projects: {v1['projects']}")
same = len(v1['rows']) == len(v2['rows']) and all(
    (a['project'], a['description'], a['person'], a['allocationsCd']) == (b['project'], b['description'], b['person'], b['allocationsCd'])
    for a, b in zip(v1['rows'], v2['rows']))
check(same, f"v1 Plan rows ({len(v1['rows'])}) have the same project/description/person/fractions as v2 (v2 only adds certainty)")
if not same:
    for a in v1['rows']:
        b = next((x for x in v2['rows'] if x['description'] == a['description'] and x['person'] == a['person']), None)
        if not b or a['allocationsCd'] != b['allocationsCd'] or a['project'] != b['project']:
            print(f"  DIFF  v1 row {a['row']} {a['project']} › {a['description']} ({a['person']}): {a['allocationsCd']} vs v2 {b and b['allocationsCd']}")

print('\n## Summary')
print(f"  failures: {len(fails)}")
for f in fails:
    print('  - ' + f)
````

### 7.6 Source: `rounding-probe.mjs`

````js
// Compare 1-decimal display of cd/100 via toFixed / Intl.NumberFormat against exact integer half-up.
const fmt1 = (cd) => { const t = Math.floor((cd + 5) / 10); return `${Math.floor(t / 10)}.${t % 10}`; };
const nf = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nfTh = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
let badFixed = 0, badIntl = 0, badTh = 0; const exF = [], exI = [];
for (let cd = 0; cd <= 70000; cd++) {
  const exact = fmt1(cd);
  const a = (cd / 100).toFixed(1); const b = nf.format(cd / 100).replace(/,/g, ''); const c = nfTh.format(cd / 100).replace(/,/g, '');
  if (a !== exact) { badFixed++; if (exF.length < 5) exF.push([cd, a, exact]); }
  if (b !== exact) { badIntl++; if (exI.length < 5) exI.push([cd, b, exact]); }
  if (c !== exact) badTh++;
}
console.log(JSON.stringify({ node: process.version, icu: process.versions.icu, range: '0..70000 cd', toFixedMismatches: badFixed, toFixedExamples: exF, intlEnMismatches: badIntl, intlExamples: exI, intlThMismatches: badTh, thSample: nfTh.format(3.75), intlResolved: nf.resolvedOptions().roundingMode }, null, 1));
````
