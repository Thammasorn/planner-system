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
