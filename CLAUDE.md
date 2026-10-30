# CLAUDE.md — Team Working OS

ระบบวางแผนงานและเอกสารของทีม (Asana + Notion ฉบับเรียบง่าย) · Next.js + PostgreSQL · self-host ด้วย Docker · UI ภาษาไทย

## อ่านก่อนเริ่มงานทุกครั้ง

- **`SPEC.md` คือแหล่งความจริงเดียว** — requirement, business rule, schema, สิทธิ์, ลำดับการสร้าง
- **`PROGRESS.md`** — สถานะปัจจุบัน, milestone ที่กำลังทำ, decisions, deviations
- **`PLAN.md` + `plan/mNN-*.md`** — แผน implement ละเอียดแบบ multi-agent: decisions ที่ตัดสินแล้ว (§1), วิธีทำงานของ agent (§2), contract ข้าม milestone (§3), การทดสอบ (§4), ขั้นตอนทีละ stream ของแต่ละ milestone; ข้อเท็จจริงของ library ที่ตรวจแล้ว + โค้ดตัวอย่างอยู่ใน `plan/research/`
- **`docs/`** — บริบทเสริม อ่านอย่างเดียว: ที่มาของ requirement (`docs/history/decisions-log.md`), Excel เดิม, ข้อมูล seed + ผลที่คาดหวัง (`docs/reference/golden-fixtures.json`) — ดูดัชนีที่ `docs/README.md`
- เริ่ม session ใหม่: อ่าน `PROGRESS.md` → `PLAN.md` §0–§2 → `plan/mNN-*.md` ของ milestone ปัจจุบัน → SPEC §0–§3 → หัวข้อที่ milestone ปัจจุบันอ้างถึงใน SPEC §12
- ลำดับความสำคัญเมื่อขัดกัน: `SPEC.md` > `CLAUDE.md` > `PLAN.md` / `plan/**` > `docs/**`

## วิธีทำงาน

1. ทำ **ทีละ milestone** ตาม SPEC §12 — ห้ามทำของ milestone ถัดไปล่วงหน้า ห้ามทำสิ่งใน SPEC §1.4 และ §13
2. ก่อนเขียนโค้ด: เขียนแผนย่อยของ milestone ลง `PROGRESS.md`
3. Domain logic: **เขียน test ก่อน** แล้วค่อย implement (`src/domain/**`)
4. จบ milestone: `pnpm check` เขียว + e2e ของ milestone ผ่าน → อัปเดต `PROGRESS.md` → commit `feat(m<N>): <สรุป>`
5. Spec ไม่ชัด → เลือกทางที่ง่ายที่สุดที่สอดคล้องกับ SPEC §1.3 แล้วบันทึกใน `PROGRESS.md › Decisions` แล้วทำต่อ ไม่ต้องหยุดรอ
6. ทำตาม spec ไม่ได้ทางเทคนิค → บันทึกใน `PROGRESS.md › Deviations` (อะไร, ทำไม, ทำอะไรแทน)

## หมายเหตุ M0 (scaffold)

- โฟลเดอร์นี้มีไฟล์อยู่แล้ว → `create-next-app` จะปฏิเสธ ให้ scaffold ในโฟลเดอร์ชั่วคราว (เช่น `/tmp/scaffold`) แล้วย้ายไฟล์เข้ามา **โดยห้ามเขียนทับ** `CLAUDE.md`, `SPEC.md`, `PROGRESS.md`, `docs/`
- `git init` ที่โฟลเดอร์นี้ (ถ้ายังไม่มี) และใส่ `.env`, `node_modules`, `.next`, `uploads/`, `backups/` ใน `.gitignore` — ไฟล์ `.xlsx` ใน `docs/reference/` commit ได้
- `scripts/seed-golden.ts` อ่านข้อมูลจาก `docs/reference/golden-fixtures.json` (หน่วย cd อยู่แล้ว)
- ตั้ง `agentRules: false` ใน `next.config.ts` **ก่อน** รัน `pnpm dev` ครั้งแรก — ไม่งั้น `next dev` 16.3 จะเขียนบล็อกของมันลงใน `CLAUDE.md` นี้ (PLAN.md §1.3)

## คำสั่ง

```bash
pnpm dev                # dev server
pnpm db:up              # Postgres สำหรับ dev (docker-compose.dev.yml)
pnpm db:generate        # drizzle-kit generate จาก schema.ts
pnpm db:migrate         # apply migrations
pnpm db:studio
pnpm seed:golden        # ข้อมูลจาก Excel เดิม (ใช้ใน test)
pnpm seed:demo          # golden + milestone, หน้าเอกสาร, วันลา
pnpm test               # vitest
pnpm test:e2e           # playwright
pnpm check              # typecheck + lint + unit test — ต้องเขียวก่อน commit ทุกครั้ง
docker compose -f docker/docker-compose.yml up -d --build   # production-like
```

- ใช้ `pnpm` เท่านั้น (`pnpm exec` / `pnpm dlx`) — หลัง M0 ตั้ง `devEngines` แล้ว `npm`/`npx` ใช้ในโปรเจคไม่ได้ · `pnpm check` รวม integration test ด้วย จึงต้อง `pnpm db:up` ก่อน (PLAN.md §3.2, X40)

## กฎที่ห้ามละเมิด

### สิทธิ์
- ตรวจสิทธิ์ใน `src/server/authz.ts` เท่านั้น — **ทุก** server action และ route handler ต้องเรียกก่อนแตะข้อมูล
- ไม่มีสิทธิ์เห็น → ตอบ **404** ไม่ใช่ 403
- การปกปิดข้อมูล (SPEC §3.3) ทำที่ server — ห้ามส่งชื่อโปรเจค/task ที่ผู้ดูไม่มีสิทธิ์ไปที่ client แม้จะซ่อนใน UI
- เพิ่ม action ใหม่ → เพิ่ม authz test ใน table-driven suite ด้วยเสมอ

### ตัวเลขและวันที่
- ภาระงานในโค้ดเป็น **centi-day จำนวนเต็ม** (`100` = 1 วัน-คน) — **ห้ามคิดเลขภาระด้วย float**
- DB เก็บ `numeric(4,2)`; แปลงที่ขอบ repo เท่านั้น; API ส่ง cd
- วันที่ของแผนเป็น string `'YYYY-MM-DD'` + ฟังก์ชันใน `src/domain/dates.ts` — **ห้ามใช้ JS `Date` กับวันที่ของแผน**
- สัปดาห์เริ่มวันจันทร์; "วันนี้" = `todayBangkok()`
- ทุก query ที่แตะ `allocations` ต้องมีช่วง `week_start`

### สถาปัตยกรรม
- `src/domain/**` = pure TypeScript ห้าม import DB, Next, React
- Server action บาง ๆ: `zod parse → authz → service → audit → revalidate`
- อ่านข้อมูลกริด/workload ผ่าน route handler + TanStack Query; เขียนผ่าน server action
- งานที่เขียนหลายตารางต้องอยู่ใน transaction เดียว
- การเปลี่ยน WEEK↔DAY: DELETE ก่อน INSERT ใน transaction เดียว (มี trigger กันไว้)

### UX
- ข้อความ UI ทุกคำอยู่ใน `src/i18n/th.ts` — ห้าม hardcode ภาษาไทยในคอมโพเนนต์
- สิ่งที่กู้คืนได้ → **ห้ามใช้ confirm dialog** ให้ลบทันที + toast "เลิกทำ" (8 วินาที) + รองรับ `Cmd+Z`
- confirm dialog มีที่เดียว: ลบโปรเจคถาวร
- สร้าง task ต้องการแค่ชื่อ — ห้ามเพิ่ม field บังคับ
- ห้ามสื่อสถานะด้วยสีอย่างเดียว

### Dependencies และ runtime
- ใช้ stack ตาม SPEC §7.1 — เพิ่ม library ใหม่ต้องมีเหตุผลใน `PROGRESS.md › Decisions`
- Server อาจไม่มีอินเทอร์เน็ต: ห้ามโหลด font/script/รูปจาก CDN ตอน runtime
- ห้ามอ่านไฟล์ `.xlsx` ใน `docs/` ตอน runtime และห้าม implement ฟีเจอร์ต้นทุน/rate card จนกว่า SPEC จะรวมไว้
- ห้ามใช้ `localStorage` เก็บข้อมูลจริง (ใช้ได้เฉพาะค่ากำหนด UI เล็ก ๆ ซึ่งควรอยู่ใน `user_preferences`)

### DB
- แก้ schema ที่ `src/server/db/schema.ts` แล้ว `pnpm db:generate` — ห้ามแก้ migration ที่ generate แล้วด้วยมือ
- Trigger/extension/exclusion constraint อยู่ใน **custom migration** (`pnpm exec drizzle-kit generate --custom --name=<ชื่อ>`) — ไฟล์ SQL ที่ตั้งชื่อเองโดยไม่อยู่ใน `drizzle/meta/_journal.json` (เช่น `9999_triggers.sql`) จะ**ไม่ถูกรัน**; generate migration ได้ทีละคนเท่านั้น (PLAN.md §1.3)

## โครงสร้าง (ย่อ)

```
src/domain/     pure logic + unit test (dates, capacity, allocation, certainty, overload, milestone, units, status, blockers)
src/server/     db/ auth.ts authz.ts repo/ services/ actions/ storage.ts audit.ts
src/app/        (auth)/ (app)/ api/
src/components/ grid/ editor/ tasks/ pages/ people/ ui/
src/i18n/th.ts
scripts/        bootstrap, seed-golden, seed-demo, seed-perf, import-holidays
docs/           บริบทเสริม (อ่านอย่างเดียว) — reference/ (Excel เดิม, golden-fixtures.json), history/
e2e/            m<N>-*.spec.ts
docker/         Dockerfile, compose, Caddyfile, backup.sh
```

## Definition of done (ทุก milestone)

- [ ] Acceptance criteria ของ milestone ใน SPEC §12 ผ่านครบ
- [ ] `pnpm check` เขียว
- [ ] e2e ของ milestone นี้ และของ milestone ก่อนหน้า ผ่าน
- [ ] authz test ครอบคลุม action ใหม่ทั้งหมด
- [ ] ไม่มี `any`, `@ts-ignore`, `eslint-disable` ที่ไม่มีคอมเมนต์เหตุผล
- [ ] `PROGRESS.md` อัปเดต
- [ ] commit แล้ว
