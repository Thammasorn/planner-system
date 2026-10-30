# Workload Planner — Requirements & Design Spec

เอกสารออกแบบ web application สำหรับวางแผนกำลังคน (ต่อยอดจาก `Workload_Planner_Aug-Dec_2026_v2.xlsx`)

| | |
|---|---|
| **เวอร์ชัน** | 2.1 |
| **วันที่** | 15 กันยายน 2026 |
| **สถานะ** | Draft — พร้อมให้ dev / AI agent เอาไป implement |
| **Stack ที่เลือก** | Next.js (App Router) + TypeScript + PostgreSQL |
| **ที่มา** | Excel template ที่ใช้งานอยู่จริง + ข้อกำหนดเพิ่มเติมรอบที่ 2–3 |
| **Positioning** | เครื่องมือวางแผน task แบบ Asana **แต่ง่ายกว่ามาก** — §1.4 |

**สิ่งที่เปลี่ยนจาก v1.0**

| หัวข้อ | v1.0 | ปัจจุบัน |
|---|---|---|
| ช่วงเวลา | Plan มีขอบเขตตายตัว (18 สัปดาห์) | **Timeline ต่อเนื่องไม่มีขอบ** — §5.1 |
| ความละเอียด | รายสัปดาห์อย่างเดียว | **สัปดาห์ + รายวัน เชื่อมโยงกัน** — §5.5 |
| หน่วยงาน | Assignment แบน 1 ชั้น | **Project → Section → Task ซ้อนชั้นได้** — §5.3 |
| วันลา | Phase 2 | **อยู่ใน MVP** — §5.6 |
| Actual vs Plan | เป็นคำถามค้าง | **ตัดทิ้ง** — ใช้วางแผนอย่างเดียว |
| หน่วยวัด | คะแนน 0–1 ต่อสัปดาห์ | **person-day** เป็นหน่วยภายใน, แสดงผลได้ทั้ง 2 แบบ — §5.2 |
| บทบาทของระบบ | ชั้น capacity planning ที่อยู่เหนือ Asana | **แทน Asana ไปเลย** สำหรับงานวางแผน — §1.4, §1.5 |
| Approval workflow ของแผน | เป็นคำถามค้าง | **ไม่มี** — ทุกคนที่มีสิทธิ์แก้ได้ทันที §1.5 |
| มุมมอง | กริดอย่างเดียว | **กริด / ลิสต์ / บอร์ด** สลับได้บนข้อมูลชุดเดียว — §8.10 |

---

## 1. ภาพรวม

### 1.1 ปัญหาที่แก้

ทีมวางแผนกำลังคนด้วย Excel: 1 แถว = 1 คน × 1 โปรเจค, ใส่คะแนนความหนัก 0–1 ต่อสัปดาห์ แล้วให้สูตรรวมว่าใคร overload สัปดาห์ไหน

| ปัญหาใน Excel | ผลกระทบ | แก้ด้วย |
|---|---|---|
| แก้พร้อมกันหลายคนไม่ได้ | ส่งไฟล์ไปมา เกิดเวอร์ชันหลง | multi-user + audit |
| ช่วงเวลาตายตัว | หมดไตรมาสต้องสร้างไฟล์ใหม่ทั้งใบ | §5.1 timeline ต่อเนื่อง |
| วางได้แค่รายสัปดาห์ | งานสั้น 2 วันต้องปัดเป็นทั้งสัปดาห์ | §5.5 zoom ลงรายวัน |
| capacity คงที่ 1.00 ทุกคนทุกสัปดาห์ | คนลาพักร้อน / วันหยุดยาว / พาร์ตไทม์ สะท้อนไม่ได้ | §5.6 ปฏิทินทำงาน |
| งานย่อยในโปรเจคแยกไม่ได้ | ทุกอย่างเป็นแถวแบน ๆ จัดกลุ่มไม่ได้ | §5.3 ลำดับชั้น |
| สูตรพังเมื่อแทรก/ลบแถว | คนใช้กลัวแตะไฟล์ | — |

### 1.2 สิ่งที่ต้องรักษาไว้จาก Excel

ผู้ใช้คุ้นกับ mental model ชุดนี้แล้ว — เว็บต้องไม่หักดิบ:

1. **ตัวเลข 0–1 ต่อสัปดาห์** ยังเป็นค่า default ที่เห็นบนหน้าจอ (1.00 = เต็มเวลา) แม้ข้างในจะเก็บเป็น person-day
2. **กริดคน × เวลา** เป็นหน้าจอหลัก ไม่ใช่ list view
3. **2 ฉาก** — "ถ้าทำทุกอย่าง" vs "เฉพาะงานที่ยืนยันแล้ว"
4. **สีเดิม** — แดง = เกิน capacity, เขียว = 80–100%, เหลือง = ต่ำกว่า 80%
5. **ความแน่นอน 2 ระดับ** — `แน่นอน` / `อาจไม่ทำ`

### 1.3 ปรัชญาการออกแบบ

> **"วางแผนหยาบได้เร็ว วางละเอียดได้เมื่อจำเป็น"**

เครื่องมือวางแผนส่วนใหญ่ล้มเหลวเพราะบังคับให้ละเอียดตั้งแต่ต้น — งานเดือนหน้ายังไม่รู้จะเริ่มวันไหน แต่ระบบขอ start/end date
ที่นี่: **สัปดาห์คือหน่วยเริ่มต้น** วางคร่าว ๆ ได้ทั้งไตรมาสในไม่กี่นาที แล้วค่อย zoom ลงรายวันเฉพาะสัปดาห์ที่ใกล้เข้ามาหรือที่ต้องประสานงานจริง

### 1.4 Positioning — "Asana แต่ง่ายกว่า"

ระบบนี้ **เป็นเครื่องมือวางแผน task หลักของทีม** ไม่ใช่ชั้นเสริมที่อยู่เหนือเครื่องมืออื่น เป้าหมายคือทีมเปิดแท็บเดียวแล้วจบ

| | Asana / Jira | ระบบนี้ |
|---|---|---|
| จุดแข็ง | ครอบคลุมทุกกรณีการใช้งาน | ทำน้อยอย่างแต่ทำให้ดีมาก |
| หน้าหลัก | ลิสต์งานของโปรเจคทีละอัน | **กริดกำลังคน** เห็นทุกคนทุกโปรเจคพร้อมกัน |
| คำถามที่ตอบได้ดี | "งานนี้ถึงไหนแล้ว" | **"ใครว่าง / ใครล้น / รับงานใหม่ได้ไหม"** |
| capacity | ต้องซื้อ add-on หรือไม่มี | เป็นแกนของระบบ |
| วันลา | แยกระบบ | อยู่ในกริดเดียวกัน |
| เวลาเรียนรู้ | เป็นวัน | **ไม่เกิน 15 นาที** |

**Non-goals** — สิ่งที่ตั้งใจไม่ทำ แม้ Asana จะมี:

- **ไม่ใช่ time tracking** — ไม่บันทึกเวลาจริง ไม่มี actual vs plan
- ไม่มี dependency / critical path / Gantt ที่มีเส้นเชื่อม
- ไม่ทำ cost / billing / invoice
- ไม่มี approval workflow ของแผน — ใครมีสิทธิ์ก็แก้ได้ทันที (audit log คือกลไกความรับผิดชอบ ไม่ใช่การขออนุมัติ)

### 1.5 ★ "ง่ายกว่า" แปลว่าอะไร — หลักการที่ต้องยึดตอน implement

คำว่า "ง่ายกว่า" ถ้าไม่นิยามให้ชัด จะกลายเป็นข้ออ้างให้ feature ไหลเข้ามาเรื่อย ๆ จนกลายเป็น Asana อีกตัว นี่คือกฎที่ต้องใช้ตัดสินทุกครั้งที่มีคนขอ feature ใหม่:

**1. จำนวน concept ที่ผู้ใช้ต้องเรียนรู้ ≤ 7**

```
คน · โปรเจค · section · task · ภาระงาน · ความแน่นอน · วันลา
```

ถ้า feature ใหม่เพิ่ม concept ที่ 8 ต้องมีอะไรถูกตัดออก — Asana มีเกิน 20 (custom field, rule, form, portfolio, goal, milestone, dependency, status update, approval, proofing, …)

**2. ไม่มีอะไรที่ต้อง "ตั้งค่าก่อนใช้"**

สร้าง task ต้องการแค่ **ชื่อ** — ไม่บังคับวันที่ ไม่บังคับ assignee ไม่บังคับ section
ทุกอย่างที่เหลือเติมทีหลังได้ กริดจะแสดง task ที่ยังไม่มีคนรับเป็นแถวรอ ไม่ใช่ซ่อนมันไป

**3. แก้ inline ทุกอย่าง ไม่มี modal บังคับ**

เปลี่ยนชื่อ task, ย้ายคน, ใส่ภาระ, ติ๊กเสร็จ — ทำได้ในกริดโดยไม่ต้องเปิดหน้าต่างใหม่
Task detail panel เป็นทางเลือก ไม่ใช่ทางบังคับ

**4. ไม่มี custom field / automation / rule engine**

สิ่งเหล่านี้คือที่มาของความซับซ้อนส่วนใหญ่ใน Asana ถ้าทีมต้องการจัดกลุ่มเพิ่ม ให้ใช้ **tag** (Phase 2) ซึ่งมี concept เดียวและอธิบายได้ในประโยคเดียว

**5. ไม่มี notification ที่ไม่ได้ขอ**

แจ้งเตือนเฉพาะสิ่งที่กระทบคนนั้นโดยตรงและต้องลงมือ — คนถูกวางงานเกิน capacity, มีงานวางไว้ในวันที่ลา
ไม่แจ้งว่า "มีคนคอมเมนต์", "มีคนแก้ task", "งานใกล้ครบกำหนด"

**6. หนึ่งหน้าจอตอบคำถามหลักได้**

เปิดเว็บมาต้องเห็นทันทีว่า *สัปดาห์นี้และอีก 3 เดือนข้างหน้า ใครล้น ใครว่าง* โดยไม่ต้องคลิกอะไรเลย
ถ้าคำตอบต้องคลิกเกิน 2 ครั้ง แปลว่าออกแบบผิด

**7. ลบได้เสมอ ไม่มีทางตัน**

ทุกอย่างลบ/ย้อนกลับได้ ไม่มีสถานะที่ทำแล้วแก้ไม่ได้ (นี่คือเหตุผลหนึ่งที่ไม่มี approval workflow)

> **Litmus test สำหรับ feature ใหม่:** ถ้าอธิบายให้คนใหม่เข้าใจไม่ได้ใน 1 ประโยคโดยไม่ต้องยกตัวอย่าง — ไม่ทำ

---

## 2. Glossary

| คำ | ความหมาย |
|---|---|
| **Person** | สมาชิกทีมที่ถูกวางงานได้ มีปฏิทินทำงานของตัวเอง |
| **Client** | บริษัท / ลูกค้าเจ้าของโปรเจค |
| **Project** | ก้อนงานระดับบนสุด มี certainty ของตัวเอง |
| **Section** | กลุ่มงานในโปรเจค (เช่น Discovery / Build / Rollout) — ไม่บังคับ |
| **Task** | หน่วยงานย่อย ซ้อนใน task อื่นได้สูงสุด 3 ชั้น มี certainty override ได้ |
| **Task assignment** | task หนึ่งผูกกับคนหนึ่ง — เป็นตัวที่ถือ allocation |
| **Allocation** | ภาระงานของ task assignment หนึ่งในช่วงเวลาหนึ่ง เก็บเป็น person-day |
| **Person-day** | หน่วยภายใน 1.0 = คนหนึ่งทำงานเต็มหนึ่งวันทำการ |
| **Granularity** | `WEEK` หรือ `DAY` — ระดับความละเอียดของ allocation แถวนั้น |
| **Working day** | วันที่คนนั้นทำงานได้จริง (หักวันหยุดบริษัทและวันลาแล้ว) |
| **Capacity** | person-day ที่คนหนึ่งมีในช่วงเวลาหนึ่ง = ผลรวม working day |
| **Certainty** | `CONFIRMED` (แน่นอน) / `TENTATIVE` (อาจไม่ทำ) |
| **Effective certainty** | ค่าที่ใช้จริงหลังไล่ลำดับสืบทอด §5.4 |
| **Committed load** | ภาระเฉพาะที่ effective certainty = CONFIRMED |
| **Total load** | ภาระทั้งหมด |
| **At-risk load** | Total − Committed |
| **Time off** | การลาของคน — พักร้อน ลาป่วย ลากิจ ฯลฯ |
| **Completed** | task ที่ติ๊กว่าเสร็จแล้ว — หยุดกินเวลาในอนาคต §5.11 |
| **Unassigned task** | task ที่ยังไม่มีคนรับ — แสดงเป็นแถวรอ ไม่นับเข้า overload ของใคร |
| **View** | กริด / ลิสต์ / บอร์ด — 3 การนำเสนอของข้อมูลชุดเดียวกัน §8.10 |
| **Scenario** | ชั้น overlay ที่เก็บเฉพาะส่วนต่างจากแผนจริง (Phase 2) |

---

## 3. Personas & User stories

### 3.1 Personas

| Persona | ทำอะไร | สิ่งที่แคร์ |
|---|---|---|
| **Planner / PM** (ผู้ใช้หลัก) | วางแผน แก้แผน ตัดสินใจย้ายงาน | แก้เร็ว เห็น overload ทันที ลอง what-if ได้ |
| **Team lead** | ดูทีมตัวเอง แตกงานเป็น task ย่อย เสนอปรับ | เห็นภาระลูกทีม เห็นว่างานไหนยังไม่ชัวร์ |
| **Member** | ดูงานตัวเอง แจ้งลา | สัปดาห์นี้/วันนี้ต้องทำอะไร วันลาบันทึกแล้วหรือยัง |
| **Executive** | ดูภาพรวม ไม่แก้ | % การใช้กำลังคน โปรเจคไหนกินคนเยอะ ความเสี่ยง |

### 3.2 User stories

```
── วางแผน ─────────────────────────────────────────────────────────────
US-01  ในฐานะ Planner ฉันอยากวางแผนล่วงหน้าได้ไกลเท่าไหร่ก็ได้โดยไม่ต้องสร้าง "ไฟล์ใหม่"
       และเลื่อนดูย้อนหลัง/ไปข้างหน้าได้ต่อเนื่อง

US-02  ในฐานะ Planner ฉันอยากวางงานคร่าว ๆ ระดับสัปดาห์ก่อน
       แล้วค่อย zoom ลงรายวันเฉพาะสัปดาห์ที่ใกล้เข้ามา
       โดยตัวเลขระดับสัปดาห์ต้องอัปเดตตามอัตโนมัติ

US-03  ในฐานะ Team lead ฉันอยากแตกโปรเจคเป็น section และ task ย่อย
       เพื่อให้เห็นว่างานก้อนไหนกินเวลาใคร ไม่ใช่เห็นแค่ชื่อโปรเจครวม ๆ

US-04  ในฐานะ Planner ฉันอยากลากงานทั้งก้อนเลื่อนไปข้างหน้า 2 สัปดาห์
       เมื่อลูกค้าเลื่อน kickoff

── ความแน่นอน ─────────────────────────────────────────────────────────
US-05  ในฐานะ Planner ฉันอยาก mark ว่าโปรเจคไหน "แน่นอน" โปรเจคไหน "อาจไม่ทำ"
       เพื่อแยกภาระที่ต้องแบกจริงออกจากภาระที่ยังไม่แน่

US-06  ในฐานะ Planner ฉันอยาก override ความแน่นอนเป็นราย task ได้
       เพราะบางโปรเจคยืนยันแล้วแต่ยังมี task ปลายทางที่อาจถูกตัด

US-07  ในฐานะ Planner ฉันอยากเห็นว่าใครล้นสัปดาห์ไหน "แน่ ๆ" vs "เฉพาะถ้าทำทุกอย่าง"
       เพื่อรู้ว่าอันไหนต้องแก้แผนจริง อันไหนแค่เฝ้าดู

── วันลา / ปฏิทิน ─────────────────────────────────────────────────────
US-08  ในฐานะ Member ฉันอยากบันทึกวันลาพักร้อนของตัวเอง
       เพื่อให้คนวางแผนไม่วางงานทับ

US-09  ในฐานะ Planner ฉันอยากเห็นวันลาและวันหยุดนักขัตฤกษ์ในกริดเลย
       เพื่อไม่ต้องเปิดปฏิทินอีกหน้า

US-10  ในฐานะ Planner ฉันอยากถูกเตือนเมื่อมีคนลาในสัปดาห์ที่ฉันวางงานไว้เต็ม
       เพื่อจะได้ย้ายงานทัน

US-11  ในฐานะ Planner ฉันอยากตั้งว่าใครทำงานกี่วันต่อสัปดาห์ (พาร์ตไทม์)
       เพื่อให้ capacity คำนวณถูก

── วิเคราะห์ ──────────────────────────────────────────────────────────
US-12  ในฐานะ Executive ฉันอยากเห็น % การใช้กำลังคนรวมรายสัปดาห์
       เพื่อรู้ว่าทีมรับงานใหม่ได้อีกไหม

US-13  ในฐานะ Planner ฉันอยากลอง "ถ้าตัดโปรเจคนี้ออก จะเป็นยังไง" โดยไม่กระทบแผนจริง

US-14  ในฐานะ Planner ฉันอยาก import Excel เดิมเข้ามา และ export กลับออกไปได้

── ใช้แทน Asana ───────────────────────────────────────────────────────
US-15  ในฐานะ Team lead ฉันอยากจดงานที่นึกออกลงไปก่อนด้วยชื่ออย่างเดียว
       โดยยังไม่ต้องรู้ว่าใครทำหรือทำเมื่อไหร่

US-16  ในฐานะ Member ฉันอยากเห็นงานของตัวเองเป็นลิสต์ธรรมดา
       ไม่ใช่กริดเวลา เพราะบางทีฉันแค่อยากรู้ว่าต้องทำอะไรบ้าง

US-17  ในฐานะ Team lead ฉันอยากติ๊กว่างานเสร็จแล้ว
       เพื่อให้มันหายไปจากแผนและปลดเวลาที่จองไว้ในอนาคตคืนมา

US-18  ในฐานะ Planner ฉันอยากกด Cmd+K แล้วพิมพ์ชื่องานเพื่อกระโดดไปหามัน
       แทนที่จะต้องไล่หาในกริด
```

---

## 4. Functional requirements

`[M]` = MVP, `[2]` = Phase 2, `[3]` = Phase 3

### 4.1 ข้อมูลหลัก

| ID | Requirement | Phase |
|---|---|---|
| FR-01 | CRUD Person (ชื่อ, อีเมล, ตำแหน่ง, active/archived) | M |
| FR-02 | CRUD Client | M |
| FR-03 | CRUD Project (ชื่อ, client, certainty, สี, owner, archived) | M |
| FR-04 | CRUD Section ภายใน Project (เรียงลำดับได้) | M |
| FR-05 | Soft delete ทุก entity — ลบแล้วข้อมูลแผนเก่าต้องไม่หาย | M |
| FR-06 | Tag ติดได้ทั้ง project และ task, ใช้ filter/group ได้ | 2 |
| FR-07 | Portfolio — จัดกลุ่มโปรเจคหลายอันเข้าด้วยกัน | 3 |

### 4.2 ลำดับชั้นงาน

| ID | Requirement | Phase |
|---|---|---|
| FR-10 | CRUD Task ภายใต้ project/section | M |
| FR-11 | Task ซ้อน task ได้สูงสุด 3 ชั้น | M |
| FR-12 | ย้าย task ข้าม section / ข้าม project ได้ (drag) | M |
| FR-13 | Task มีผู้รับผิดชอบได้มากกว่า 1 คน (แต่ละคนมี allocation ของตัวเอง) | M |
| FR-14 | Task มี start/due date ไม่บังคับ — ใช้ derive allocation ตั้งต้น | M |
| FR-15 | Collapse/expand ทุกชั้น; ชั้นบนแสดงผลรวมของลูก | M |
| FR-16 | Duplicate task พร้อม allocation | 2 |
| FR-17 | Template โปรเจค — สร้างโปรเจคใหม่จากโครงเดิม | 3 |

### 4.3 Timeline ต่อเนื่อง

| ID | Requirement | Phase |
|---|---|---|
| FR-20 | ไม่มีขอบเขตแผน — เลื่อนดูย้อนหลัง/ไปข้างหน้าได้ไม่จำกัด | M |
| FR-21 | Zoom 3 ระดับ: ไตรมาส (คอลัมน์=เดือน) / เดือน (=สัปดาห์) / สัปดาห์ (=วัน) | M |
| FR-22 | ปุ่ม "วันนี้" + เส้นบอกสัปดาห์ปัจจุบัน | M |
| FR-23 | จำ zoom + ตำแหน่ง + filter ล่าสุดของผู้ใช้แต่ละคน | M |
| FR-24 | Saved view — บันทึกชุด filter+zoom ตั้งชื่อ แชร์ลิงก์ได้ | 2 |
| FR-25 | Lazy load ข้อมูลตาม viewport เพื่อไม่ดึงทั้งประวัติศาสตร์ | M |

### 4.4 การวางภาระงาน (หน้าจอหลัก)

| ID | Requirement | Phase |
|---|---|---|
| FR-30 | ใส่ค่าระดับสัปดาห์ในกริด (0–1 หรือ person-day สลับหน่วยได้) | M |
| FR-31 | Zoom เข้าสัปดาห์แล้วกระจายเป็นรายวันได้ | M |
| FR-32 | แก้รายวัน → ค่าระดับสัปดาห์อัปเดตอัตโนมัติ (§5.5) | M |
| FR-33 | แก้ระดับสัปดาห์ที่มี detail รายวันอยู่ → ถามว่าจะกระจายใหม่หรือทิ้ง detail | M |
| FR-34 | สัปดาห์ที่มี detail รายวันมีเครื่องหมายบอก | M |
| FR-35 | คีย์บอร์ดนำทางเต็มรูป (ลูกศร, Tab, Enter, Esc, shortcut ตัวเลข) | M |
| FR-36 | ลากเลือกช่วงแล้วเติมค่าเดียวกัน (fill) | M |
| FR-37 | ลากแถบงานทั้งก้อนเลื่อนซ้าย/ขวา (เคารพวันหยุด) | M |
| FR-38 | Copy/paste ช่วงเซลล์ และ paste จาก Excel (TSV) | 2 |
| FR-39 | Undo / redo | 2 |
| FR-40 | Auto-spread จาก start/due date ของ task | M |

### 4.5 ปฏิทินทำงาน & วันลา

| ID | Requirement | Phase |
|---|---|---|
| FR-50 | ตารางวันหยุดนักขัตฤกษ์ระดับองค์กร (import ปฏิทินไทยได้) | M |
| FR-51 | Work schedule ต่อคน — ทำงานวันไหนบ้าง วันละกี่ส่วน (พาร์ตไทม์) | M |
| FR-52 | CRUD Time off: ช่วงวันที่, ประเภท, เต็มวัน/ครึ่งวัน, หมายเหตุ | M |
| FR-53 | ประเภทการลาตั้งค่าได้ (พักร้อน / ป่วย / กิจ / อบรม / ลาคลอด) | M |
| FR-54 | วันลาลด capacity ทันที และดันให้เกิด overload ถ้าแผนไม่ขยับ (§5.6) | M |
| FR-55 | แสดงวันลา/วันหยุดเป็นแถบสีในกริดทุก zoom level | M |
| FR-56 | เตือนเมื่อบันทึกลาในสัปดาห์ที่คนนั้นถูกวางงานไว้เต็มแล้ว | M |
| FR-57 | มุมมองปฏิทินทีม — ใครลาวันไหนในเดือนนี้ | M |
| FR-58 | Approval flow ของการลา (ขอ → หัวหน้าอนุมัติ) | 2 |
| FR-59 | โควตาวันลาคงเหลือต่อคนต่อปี | 2 |
| FR-60 | Sync วันลาจาก Google Calendar / HR system | 3 |

### 4.6 ความแน่นอน

| ID | Requirement | Phase |
|---|---|---|
| FR-70 | Project มี `certainty` ∈ {CONFIRMED, TENTATIVE} | M |
| FR-71 | Task มี `certainty_override` ∈ {CONFIRMED, TENTATIVE, null} | M |
| FR-72 | สืบทอดผ่านชั้น task → parent → project → default §5.4 | M |
| FR-73 | UI แสดง effective certainty พร้อมบอกว่ามาจากชั้นไหน | M |
| FR-74 | เปลี่ยน certainty → ทุกตัวเลขอัปเดตทันทีโดยไม่ reload | M |
| FR-75 | บันทึกเหตุผลตอนเปลี่ยน certainty | 2 |
| FR-76 | % ความน่าจะเป็น (0–100) แทน binary → expected load | 3 |

### 4.7 มุมมองวิเคราะห์

| ID | Requirement | Phase |
|---|---|---|
| FR-80 | **Workload heatmap** คน × เวลา สลับฉาก total / committed / at-risk | M |
| FR-81 | **Overload alerts** แยก `OVER` (ล้นแน่) / `RISK` (ล้นถ้าทำทุกอย่าง) | M |
| FR-82 | แยกสาเหตุ overload ว่ามาจากงานเพิ่มหรือ capacity หด (วันลา) | M |
| FR-83 | **Timeline รายคน** — แต่ละคนทำ task ไหนช่วงไหน | M |
| FR-84 | **สรุปรายโปรเจค** — person-day รวม, จำนวนคน, ช่วงเริ่ม–จบ, peak | M |
| FR-85 | แถบสรุปทีม — รวม, % การใช้กำลังคน, จำนวนคนที่ overload | M |
| FR-86 | คลิกเซลล์ overload → เห็นรายการ task ที่ประกอบเป็นตัวเลขนั้น | M |
| FR-87 | Capacity forecast — สัปดาห์ไหนทีมยังว่างพอรับงานใหม่ | 2 |
| FR-88 | เสนอวิธีแก้อัตโนมัติ (ย้ายไปสัปดาห์ว่าง / คนว่าง) | 3 |

### 4.8 Scenario

| ID | Requirement | Phase |
|---|---|---|
| FR-90 | สร้าง scenario เป็น overlay เก็บเฉพาะส่วนต่าง | 2 |
| FR-91 | เทียบ scenario กับแผนจริง side-by-side | 2 |
| FR-92 | Toggle เปิด/ปิดโปรเจคชั่วคราวเพื่อดูผล (ไม่บันทึก) | 2 |
| FR-93 | Merge scenario กลับเข้าแผนจริง | 2 |

### 4.9 Import / Export / Collaboration

| ID | Requirement | Phase |
|---|---|---|
| FR-100 | Import จาก xlsx ตาม layout template ปัจจุบัน | M |
| FR-101 | Preview + validation ก่อน import จริง | M |
| FR-102 | Export xlsx หน้าตาใกล้เคียง template เดิม | M |
| FR-103 | Export CSV flat สำหรับ BI | 2 |
| FR-104 | Auth (Google SSO หรือ magic link) | M |
| FR-105 | Role: Admin / Planner / Member / Viewer | M |
| FR-106 | Audit log ทุกการเปลี่ยนแปลง allocation, certainty, time off | M |
| FR-107 | Realtime multi-user | 2 |
| FR-108 | Comment ระดับ task | 2 |
| FR-109 | แจ้งเตือน Slack/email เมื่อเกิด overload ใหม่ | 3 |

### 4.10 มุมมองและการทำงานกับ task (ส่วนที่ทำให้แทน Asana ได้)

| ID | Requirement | Phase |
|---|---|---|
| FR-110 | สร้าง task ด้วยชื่ออย่างเดียว — ไม่บังคับ assignee / วันที่ / section | M |
| FR-111 | Quick add: พิมพ์ในช่องเดียวแล้ว Enter สร้างทันที ไม่เด้ง modal | M |
| FR-112 | แก้ inline ทุก field ในทุกมุมมอง | M |
| FR-113 | ติ๊กว่าเสร็จ (`completed`) — ซ่อนจากมุมมองปกติ, กฎการนับภาระดู §5.12 | M |
| FR-114 | **มุมมองลิสต์** — ตารางแบน sort/filter/group ได้ | M |
| FR-115 | **มุมมองกริด** (กำลังคน) — หน้า default | M |
| FR-116 | **มุมมองบอร์ด** — คอลัมน์ = section, การ์ด = task | 2 |
| FR-117 | สลับมุมมองโดยไม่เสีย filter และตำแหน่งที่อยู่ | M |
| FR-118 | Task detail panel เลื่อนออกมาจากขวา ไม่ปิดกริด | M |
| FR-119 | Task ที่ยังไม่มีคนรับ แสดงเป็นแถว "รอมอบหมาย" ไม่ซ่อน | M |
| FR-120 | Command palette (`Cmd+K`) ค้นหา task / คน / โปรเจค แล้วกระโดดไป | M |
| FR-121 | Multi-select task แล้วทำ bulk action (ย้าย, มอบหมาย, ติ๊กเสร็จ, ลบ) | 2 |
| FR-122 | Import โครงงานจาก Asana / CSV ครั้งเดียวตอนย้ายระบบ | 2 |
| FR-123 | Task มี checklist ย่อยแบบไม่มีภาระงาน (สำหรับ note ไม่ใช่การวางแผน) | 3 |

**สิ่งที่จงใจไม่มี** (อ้างอิง §1.5) — custom field, rule/automation, form, milestone, dependency, status update, portfolio ซ้อนชั้น, proofing, goal

---

## 5. Domain model & business rules

> ส่วนนี้คือ spec ของ calculation engine — ต้อง implement ให้ตรงเป๊ะและมี unit test ครบ

### 5.1 Timeline ต่อเนื่อง

ไม่มี entity `Plan` — ข้อมูลทั้งหมดอยู่บนไทม์ไลน์เดียวต่อเนื่องขององค์กร

- **สัปดาห์เริ่มวันจันทร์** เสมอ; แทนด้วย `week_start` เป็น `DATE`
- ไม่ใช้ ISO week number เพราะพังตอนข้ามปี (week 53)
- ทุก query ต้องมี **หน้าต่างเวลา** (`from`, `to`) เสมอ — ห้ามมี query ที่ดึงทุกอย่าง
- Default window ที่ UI เปิดมา: 4 สัปดาห์ย้อนหลัง + 12 สัปดาห์ข้างหน้า

```ts
function toWeekStart(d: Date): Date          // snap ไปวันจันทร์ที่ <= d
function weekRange(from: Date, to: Date): Date[]
function formatWeekLabel(d: Date, locale: 'th'|'en'): string   // "31 ส.ค." / "31 Aug"
```

**ผลที่ตามมาจากการไม่มี Plan**

| เรื่อง | v1.0 (มี Plan) | v2.0 (ต่อเนื่อง) |
|---|---|---|
| Scenario | โคลนทั้ง plan | overlay เก็บเฉพาะ delta §6.4 |
| Archive ของเก่า | ลบ plan เก่า | archive ที่ระดับ project |
| Performance | โหลดทั้ง plan ทีเดียวได้ | ต้อง window + virtualize เสมอ |
| "ไตรมาสนี้" | = plan หนึ่งอัน | = saved view ที่ตั้ง filter ช่วงวันที่ |

### 5.2 หน่วยของภาระงาน

**หน่วยภายใน = person-day** (`numeric(4,2)`)

| | |
|---|---|
| `1.0 person-day` | คนหนึ่งทำงานเต็มหนึ่งวันทำการ |
| สัปดาห์มาตรฐาน | `5.0 person-day` (จ–ศ) |
| การแสดงผล | สลับได้ระหว่าง **วัน** (`2.5 วัน`) และ **สัดส่วน** (`0.50`) |

**ทำไมไม่เก็บเป็นสัดส่วน 0–1 เหมือน Excel**

สัดส่วนกำกวมเมื่อสัปดาห์นั้นไม่เต็ม 5 วัน — "0.50 ของสัปดาห์ที่มีวันหยุด 2 วัน" แปลว่า 1.5 วันหรือ 2.5 วัน? การเก็บเป็น person-day ทำให้ภาระงาน (demand) เป็นค่าสัมบูรณ์ ส่วน capacity เป็นค่าที่ยืดหดตามปฏิทิน — สองอย่างนี้เปรียบเทียบกันได้ตรงไปตรงมา และเป็นเงื่อนไขที่ทำให้เรื่องวันลาทำงานถูก (§5.6)

**การแปลงตอนแสดงผล**

```ts
// สัดส่วนที่เห็นบนจอ = person-day ที่วางไว้ ÷ capacity จริงของสัปดาห์นั้น
displayFraction(personDays, capacity) = capacity > 0 ? personDays / capacity : null

// ผู้ใช้พิมพ์สัดส่วน → แปลงกลับด้วย capacity ของสัปดาห์นั้น
parseFraction(f, capacity) = f * capacity
```

> ผลข้างเคียงที่ต้องอธิบายใน UI: พิมพ์ `1.00` ในสัปดาห์ที่มีวันหยุด 1 วัน จะได้ 4.0 person-day ไม่ใช่ 5.0 — เพราะ "เต็มเวลา" หมายถึงเต็มเวลาที่คนนั้นมีจริง ให้ tooltip แสดง `1.00 × 4 วันทำการ = 4.0 วัน`

### 5.3 ลำดับชั้นงาน

```
Client
 └─ Project                    ← certainty ตั้งที่นี่เป็นหลัก
     └─ Section (optional)     ← แค่จัดกลุ่มสายตา ไม่มีผลต่อการคำนวณ
         └─ Task               ← certainty override ได้
             └─ Task (ลูก)      ← override ได้ สืบทอดจากแม่
                 └─ Task       ← ชั้นสุดท้าย (depth ≤ 3)
                     └─ TaskAssignment (task × person)  ← ถือ allocation
```

**กฎสำคัญ**

| กฎ | รายละเอียด |
|---|---|
| Allocation อยู่ที่ leaf เท่านั้น | task ที่มีลูกจะไม่มี allocation ของตัวเอง — ค่าที่เห็นคือผลรวมของลูก |
| เพิ่มลูกให้ task ที่มี allocation อยู่แล้ว | ต้องถาม: ย้าย allocation ไปลูกตัวแรก หรือทิ้ง |
| ลบ task ที่มีลูก | ลบทั้งกิ่ง (ยืนยัน 2 ชั้น) |
| ย้าย task ข้าม project | allocation ติดไปด้วย; effective certainty คำนวณใหม่ตามโปรเจคปลายทาง |
| Section ไม่มีผลต่อการคำนวณ | ย้าย task ข้าม section ไม่กระทบตัวเลขใด ๆ |
| depth สูงสุด 3 | ลึกกว่านั้นคนใช้หลงและ query แพง |

**ทำไมแยก TaskAssignment ออกจาก Task**

task หนึ่งอาจมี 2 คนทำด้วยภาระต่างกัน (dev 3 วัน + QA 1 วัน) การให้ allocation ผูกกับ (task, person) ทำให้กรณีนี้ธรรมชาติ และ query "ภาระของคนนี้" ไม่ต้อง join ซับซ้อน

### 5.4 Effective certainty — ลำดับการสืบทอด

```
effectiveCertainty(task):
  1. ถ้า task.certainty_override ไม่ null            → ใช้ค่านั้น
  2. ไล่ขึ้นไปหา parent task ที่มี override ตัวแรก    → ใช้ค่านั้น
  3. ถ้า project.certainty ไม่ null                  → ใช้ค่านั้น
  4. default                                         → CONFIRMED
```

```ts
function effectiveCertainty(task: Task, ancestors: Task[], project: Project): {
  value: Certainty
  source: 'task' | 'ancestor' | 'project' | 'default'
  sourceId?: string          // ใช้แสดง tooltip "สืบทอดจาก task X"
} {
  if (task.certaintyOverride) return { value: task.certaintyOverride, source: 'task' }
  for (const a of ancestors) {                    // เรียงจากใกล้ไปไกล
    if (a.certaintyOverride)
      return { value: a.certaintyOverride, source: 'ancestor', sourceId: a.id }
  }
  if (project.certainty) return { value: project.certainty, source: 'project' }
  return { value: 'CONFIRMED', source: 'default' }
}
```

**ทำไม default เป็น CONFIRMED:** ข้อมูลที่ยังไม่ตั้งค่าควรถูกนับเข้าภาระงาน ไม่ใช่ถูกซ่อน — ประเมินภาระต่ำเกินจริงอันตรายกว่าสูงเกินจริง

### 5.5 ★ การเชื่อมระดับสัปดาห์กับรายวัน

นี่คือกลไกที่ตอบโจทย์ "วางรายสัปดาห์และรายวันให้เชื่อมโยงกัน" — และเป็นจุดที่พังง่ายที่สุดถ้าออกแบบไม่ชัด

#### หลักการ: แหล่งความจริงเดียวต่อ (assignment, สัปดาห์)

แต่ละคู่ `(task_assignment, week)` มีสถานะเดียวใน 2 สถานะนี้เท่านั้น:

| Resolution | เก็บอะไร | ระดับวันแสดงยังไง |
|---|---|---|
| `WEEK` | แถวเดียว `granularity=WEEK`, person_days ของทั้งสัปดาห์ | **คำนวณให้ดู** — กระจายตาม capacity รายวัน (เส้นประ แก้ไม่ได้ตรง ๆ) |
| `DAY` | หลายแถว `granularity=DAY` วันละแถว | แสดงค่าจริง แก้ได้ |

**Invariant ที่ DB ต้องบังคับ:** สำหรับ `(task_assignment, week)` หนึ่ง จะมี *แถว WEEK หนึ่งแถว* **หรือ** *แถว DAY อย่างน้อยหนึ่งแถว* เท่านั้น — มีทั้งคู่ไม่ได้

#### การกระจายลงวัน (เมื่อ resolution = WEEK)

```ts
function derivedDayLoad(weekPersonDays: number, person: Person, day: Date, week: Date): number {
  const dayCap  = dayCapacity(person, day)        // §5.6
  const weekCap = weekCapacity(person, week)
  if (weekCap === 0) return 0
  return round2(weekPersonDays * dayCap / weekCap)
}
```

**คุณสมบัติที่ได้ฟรีจากสูตรนี้:** วันที่ลาหรือวันหยุด `dayCapacity = 0` → กระจายลงวันนั้น = 0 โดยอัตโนมัติ ไม่ต้องเขียน logic แยก

#### การเปลี่ยน resolution

```
WEEK → DAY  (ผู้ใช้ zoom เข้าไปแล้วแก้วันใดวันหนึ่ง)
  1. คำนวณค่ากระจายของทุกวันในสัปดาห์นั้นด้วย derivedDayLoad
  2. เขียนเป็นแถว DAY จริง (วันที่ได้ 0 ไม่ต้องเขียน)
  3. ลบแถว WEEK
  4. ทับค่าวันที่ผู้ใช้เพิ่งแก้
  → ผลรวมสัปดาห์เปลี่ยนเฉพาะส่วนที่ผู้ใช้แก้ ที่เหลือคงเดิม

DAY → WEEK  (ผู้ใช้กด "กลับเป็นระดับสัปดาห์")
  1. รวม person_days ของทุกแถว DAY ในสัปดาห์นั้น
  2. เขียนเป็นแถว WEEK แถวเดียว
  3. ลบแถว DAY ทั้งหมด
  → ผลรวมสัปดาห์ไม่เปลี่ยน แต่ detail หาย (ต้องเตือน)
```

#### เมื่อผู้ใช้แก้ค่าระดับสัปดาห์ทั้งที่ resolution = DAY

ต้องถาม ห้ามเดา:

```
┌──────────────────────────────────────────────────────────┐
│  สัปดาห์นี้มีการวางรายวันอยู่ (จ 1.0 · อ 1.0 · พ 0.5)      │
│  คุณกำลังเปลี่ยนยอดรวมจาก 2.5 → 4.0 วัน                   │
│                                                           │
│  ○ ขยายตามสัดส่วนเดิม   จ 1.6 · อ 1.6 · พ 0.8            │
│  ○ เติมวันที่ยังว่าง     จ 1.0 · อ 1.0 · พ 1.0 · พฤ 1.0   │
│  ○ ทิ้งรายวัน กลับเป็นระดับสัปดาห์                         │
│                                       [ยกเลิก] [ตกลง]     │
└──────────────────────────────────────────────────────────┘
```

> **ข้อควรระวังตอน implement:** ตัวเลือก "ขยายตามสัดส่วน" ต้อง clamp ไม่ให้วันใดเกิน `dayCapacity` — ถ้าเกินให้ไหลไปวันถัดไป ไม่ใช่ปล่อยให้เกิน

#### สัญญาณบอกใน UI

- สัปดาห์ที่ resolution = DAY → มีจุดเล็ก 3 จุดใต้ตัวเลข
- Hover → tooltip แสดง breakdown รายวัน
- Zoom ระดับสัปดาห์: วันที่มาจากการกระจาย (WEEK) วาดเป็นเส้นประ / opacity ต่ำ; วันที่วางจริง (DAY) วาดทึบ

#### สรุป: ระดับไหนใช้เมื่อไหร่

| สถานการณ์ | ระดับที่แนะนำ |
|---|---|
| วางแผนไตรมาสหน้า | WEEK |
| งานที่กินเวลา ≥ 1 สัปดาห์ | WEEK |
| สัปดาห์ที่กำลังจะถึง | DAY |
| งานสั้น 1–2 วัน | DAY |
| ต้องประสานคนหลายคนให้ตรงวัน | DAY |

### 5.6 ★ ปฏิทินทำงาน, วันหยุด และวันลา

#### องค์ประกอบ 3 ชั้น

```
1. Work schedule ของคน   → ปกติทำงานวันไหน วันละเท่าไหร่   (ถาวร)
2. วันหยุดองค์กร          → วันหยุดนักขัตฤกษ์ วันหยุดบริษัท  (ทั้งองค์กร)
3. Time off ของคน        → ลาพักร้อน ลาป่วย ลากิจ          (เฉพาะช่วง)
```

#### สูตร capacity

```ts
function dayCapacity(p: Person, d: Date): number {
  // 1. ตารางงานประจำ — จ–ศ = 1.0, ส–อา = 0 (ปรับได้รายคน)
  const base = p.workSchedule[weekday(d)] ?? 0        // 0..1
  if (base === 0) return 0

  // 2. วันหยุดองค์กร
  if (isOrgHoliday(p.orgId, d)) return 0

  // 3. วันลา — รองรับลาครึ่งวัน
  const off = timeOffFraction(p.id, d)                // 0..1
  return round2(Math.max(0, base - off))
}

function weekCapacity(p: Person, weekStart: Date): number {
  return sum(daysOfWeek(weekStart).map(d => dayCapacity(p, d)))
}
```

| กรณี | ผลลัพธ์ |
|---|---|
| ปกติ จ–ศ | `weekCapacity = 5.0` |
| ลาพักร้อน 2 วัน | `weekCapacity = 3.0` |
| ลาครึ่งวันบ่ายวันศุกร์ | `weekCapacity = 4.5` |
| พาร์ตไทม์ จ/พ/ศ | `weekCapacity = 3.0` |
| พาร์ตไทม์ จ/พ/ศ + ลาวันพุธ | `weekCapacity = 2.0` |
| สัปดาห์สงกรานต์ (หยุด 3 วัน) | `weekCapacity = 2.0` |

#### ★ หลักการสำคัญ: วันลา**ลด capacity** ไม่ใช่**ลดภาระงาน**

นี่คือการตัดสินใจออกแบบที่สำคัญที่สุดของหัวข้อนี้

```
Peter ถูกวางงาน Data Warehouse ไว้ 5.0 person-day ในสัปดาห์ที่ 12 ต.ค.
ต่อมาเขาบันทึกลาพักร้อน 2 วัน

❌ ทางที่ผิด: ระบบลดภาระงานเหลือ 3.0 อัตโนมัติ
   → งาน 2 วันหายไปเฉย ๆ ไม่มีใครรู้ว่าต้องไปทำเมื่อไหร่ แผนดูสวยแต่โกหก

✅ ทางที่ถูก: ภาระยังเป็น 5.0 แต่ capacity เหลือ 3.0
   → เกิด OVER +2.0 → ขึ้นเตือน → คนวางแผนตัดสินใจเองว่าจะเลื่อน ย้ายคน หรือลดขอบเขต
```

ข้อความเตือนต้องบอกสาเหตุให้ชัดว่ามาจาก capacity หด ไม่ใช่งานเพิ่ม (FR-82):

> 🔴 **Peter · สัปดาห์ 12 ต.ค. — เกิน 2.0 วัน**
> capacity ลดจาก 5.0 → 3.0 เพราะลาพักร้อน 12–13 ต.ค.
> [เลื่อนงานไปสัปดาห์ถัดไป] [ย้ายให้คนอื่น] [ลดขอบเขตงาน]

#### กรณีขอบที่ต้องจัดการ

| กรณี | พฤติกรรมที่กำหนด |
|---|---|
| ลาทั้งสัปดาห์ (`weekCapacity = 0`) | แสดง `—` ไม่ใช่ `0%`; ถ้ามีภาระ > 0 → `OVER` ทันที; สัดส่วนแสดงเป็น `∞` ไม่ได้ ให้แสดง person-day แทน |
| ลาย้อนหลังในสัปดาห์ที่ resolution = DAY และวันนั้นมีงานวางอยู่ | **ไม่ลบงานอัตโนมัติ** — ขึ้นเตือน "มีงาน 1.0 วันวางไว้ในวันที่ลา" พร้อมปุ่มย้าย |
| ลาคาบเกี่ยว 2 สัปดาห์ | ตัดตามขอบสัปดาห์ในการคำนวณ capacity แต่เก็บเป็น range เดียว |
| ลาครึ่งวัน + งานเต็มวันในวันเดียวกัน | `dayCapacity = 0.5`, ภาระ `1.0` → OVER +0.5 ที่ระดับวัน |
| ยกเลิกวันลา | capacity กลับคืน, overload ที่เกิดจากการลานั้นหายเอง |
| วันหยุดชดเชยเพิ่มทีหลัง | recalculate capacity ของสัปดาห์นั้น + แจ้ง overload ที่เกิดใหม่ |

#### ปฏิทินวันหยุดไทย

- Seed วันหยุดราชการไทยล่วงหน้า 2 ปี
- Admin แก้ได้ (บางบริษัทไม่หยุดวันพืชมงคล / หยุดเพิ่มช่วงปีใหม่)
- รองรับ "วันหยุดชดเชย" (วันหยุดตรงเสาร์-อาทิตย์)

### 5.7 การรวมภาระ (aggregation)

```ts
type Scenario = 'total' | 'committed' | 'at_risk'

// person-day ของคน p ในช่วง [from, to)
load(p, range, 'total')     = Σ a.person_days  ∀a ∈ allocations(person=p, period ∈ range)
load(p, range, 'committed') = Σ a.person_days  where effectiveCertainty(a.task) = CONFIRMED
load(p, range, 'at_risk')   = total − committed

// ระดับโปรเจค (รวมทุกคน — เกิน capacity คนเดียวได้ปกติ)
projectLoad(j, range, s)    = ทำนองเดียวกันแต่ filter ด้วย project (รวม task ลูกทุกชั้น)

// ระดับทีม
teamLoad(range, s)     = Σ load(p, range, s) ∀p ∈ activePeople
teamCapacity(range)    = Σ capacity(p, range) ∀p ∈ activePeople
utilization(range, s)  = teamCapacity > 0 ? teamLoad(range,s) / teamCapacity : null
```

**Invariant ที่ต้องเป็นจริงเสมอ** (ใช้เป็น property-based test):

```
committed ≤ total
at_risk   ≥ 0
Σ dayLoad(d) ∀d ∈ week  =  weekLoad(week)     // ไม่ว่า resolution จะเป็นอะไร
```

### 5.8 การจัดระดับ overload

```ts
function overloadStatus(p: Person, week: Date): OverloadStatus {
  const cap  = weekCapacity(p, week)
  const comm = load(p, week, 'committed')
  const tot  = load(p, week, 'total')

  const level =
    comm > cap ? 'OVER' :          // ล้นแม้ตัดงานไม่ชัวร์ออกหมด
    tot  > cap ? 'RISK' :          // ล้นเฉพาะถ้าต้องทำทุกอย่าง
    'OK'

  return {
    level,
    excess: level === 'OVER' ? comm - cap : level === 'RISK' ? tot - cap : 0,
    // FR-82 — แยกสาเหตุ
    cause: level !== 'OK' ? diagnoseCause(p, week, cap) : null
  }
}

function diagnoseCause(p, week, cap): 'WORKLOAD' | 'CAPACITY' | 'BOTH' {
  const standardCap = standardWeekCapacity(p)       // ไม่หักลา/วันหยุด
  const capacityLost = standardCap - cap
  const overStandard = load(p, week, 'total') > standardCap
  if (capacityLost > 0 && overStandard) return 'BOTH'
  if (capacityLost > 0)                 return 'CAPACITY'   // "เพราะลา/วันหยุด"
  return 'WORKLOAD'                                          // "เพราะงานเยอะ"
}
```

| ระดับ | เงื่อนไข | ความหมาย | สิ่งที่ควรทำ |
|---|---|---|---|
| `OVER` | committed > capacity | ล้นแน่ ๆ แม้ตัดงานที่ยังไม่ชัวร์ออกหมด | ต้องแก้แผนจริง |
| `RISK` | total > capacity ≥ committed | ล้นเฉพาะถ้างาน "อาจไม่ทำ" กลายเป็นต้องทำ | เฝ้าดู / เตรียมแผนสำรอง |
| `OK` | total ≤ capacity | ปกติ | — |

การจัดระดับนี้ใช้ได้ทั้งระดับวันและสัปดาห์ — แค่เปลี่ยน `cap` เป็น `dayCapacity`

### 5.9 เกณฑ์สี

```ts
function loadColorBand(load: number, capacity: number) {
  if (capacity === 0) return load > 0 ? 'over' : 'off'   // วันลา/วันหยุด
  const r = load / capacity
  if (r > 1)    return 'over'    // แดง   bg #FFC7CE  fg #9C0006
  if (r >= 0.8) return 'full'    // เขียว bg #C6EFCE  fg #006100
  if (r > 0)    return 'light'   // เหลือง bg #FFEB9C fg #9C6500
  return 'empty'
}
```

- Heatmap ของกริดวางแผน: `0 → #FFFFFF`, `0.5 → #BDD7EE`, `1.0 → #2E75B6` (interpolate ใน OKLCH)
- ช่องที่ `capacity = 0`: ลายทางแนวเฉียงสีเทา + ไอคอน (🏖 ลา / 🎌 วันหยุด) — **ไม่ใช่แค่สีเทา** เพราะต้องแยกจาก "ว่าง"

### 5.10 Metric ที่ต้องคำนวณ

```ts
// ต่อ task assignment
totalPersonDays, weekCount, peakWeek, firstWeek, lastWeek

// ต่อ task (รวมลูกทุกชั้น)
rollupPersonDays = Σ ของลูกทั้งหมด + ของตัวเอง (ถ้าเป็น leaf)

// ต่อ project
totalAll, totalCommitted, headcount, startWeek, endWeek, peakPerWeek

// ต่อ person ต่อสัปดาห์
total, committed, atRisk, capacity, utilization, overloadStatus

// ต่อทีมต่อสัปดาห์
teamLoad, teamCapacity, utilization, overloadedCount, availableCapacity
```

### 5.11 งานที่เสร็จแล้ว

ระบบนี้ไม่ track actual แต่ยังต้องมีวิธี "เก็บกวาด" งานที่ทำเสร็จออกจากสายตา ไม่งั้นกริดจะรกขึ้นเรื่อย ๆ

**กฎเดียว ง่าย ๆ:**

```
task.completed_at = วันที่ติ๊กว่าเสร็จ (null = ยังไม่เสร็จ)

completedWeek = toWeekStart(task.completed_at)

การนับภาระ:
  สัปดาห์ < completedWeek   → นับปกติ    (เป็นประวัติของแผน)
  สัปดาห์ = completedWeek   → นับปกติ    (สัปดาห์ที่เสร็จยังใช้เวลาจริง)
  สัปดาห์ > completedWeek   → ไม่นับ      (งานเสร็จแล้ว ไม่กินเวลาอนาคต)
```

- ติ๊กเสร็จ → ภาระในอนาคตหายทันที → overload ที่เกิดจากงานนี้คลายออก
- **ไม่ลบ allocation ทิ้ง** — เก็บไว้เฉย ๆ เผื่อ un-check แล้วกลับมาเหมือนเดิม
- ถ้ายังมี allocation ในอนาคตตอนติ๊กเสร็จ → แจ้งเบา ๆ ว่า *"ปลดภาระ 3.5 วันในอีก 2 สัปดาห์ข้างหน้า"* พร้อมปุ่ม undo
- ติ๊ก task แม่ที่มีลูกยังไม่เสร็จ → ถามว่าจะติ๊กลูกทั้งหมดด้วยไหม
- มุมมองปกติซ่อน task ที่เสร็จ; มี toggle `แสดงงานที่เสร็จแล้ว`

> **ทำไมไม่ใช่ status หลายขั้น (To do / Doing / Done):** เพราะขั้นกลางไม่มีผลต่อการคำนวณภาระเลย มันคือ tracking ไม่ใช่ planning — เพิ่ม concept โดยไม่เพิ่มคำตอบให้คำถามหลัก (§1.5 ข้อ 1)

### 5.12 Validation rules

| Rule | ข้อความ |
|---|---|
| VR-00 | Task ต้องมีชื่อ — field อื่นว่างได้หมด |
| VR-01 | `person_days > 0` และ `≤ 7` (กันพิมพ์ผิด เช่น 50) |
| VR-02 | `week_start` ต้องเป็นวันจันทร์ |
| VR-03 | แถว `granularity=DAY` ที่ `period_start` เป็นเสาร์/อาทิตย์ → warning ไม่ block (บางคนทำงานเสาร์) |
| VR-04 | Task depth ≤ 3 |
| VR-05 | Task ที่มีลูกต้องไม่มี allocation ของตัวเอง |
| VR-06 | Time off: `end_date ≥ start_date`, ทับซ้อนกันเองไม่ได้ต่อคน |
| VR-07 | Invariant WEEK/DAY ของ §5.5 — บังคับด้วย DB trigger |
| VR-08 | ลบ person ที่ยังมี allocation → ยืนยันแล้ว soft delete |
| VR-09 | วางงานในวันที่ `dayCapacity = 0` → warning พร้อมปุ่มย้าย ไม่ block |

---

## 6. Data model (PostgreSQL)

### 6.1 ER overview

```
organizations
 ├─ users
 ├─ people ──┬─ work_schedules
 │           ├─ time_off
 │           └─ task_assignments ── allocations
 ├─ holidays
 ├─ clients ── projects ── sections ── tasks (self-nesting) ┘
 ├─ scenarios (Phase 2)
 └─ audit_log
```

### 6.2 DDL

```sql
create extension if not exists "pgcrypto";
create extension if not exists "citext";
create extension if not exists "btree_gist";      -- สำหรับ exclusion constraint ของ time_off

create type certainty   as enum ('CONFIRMED', 'TENTATIVE');
create type user_role   as enum ('ADMIN', 'PLANNER', 'MEMBER', 'VIEWER');
create type granularity as enum ('WEEK', 'DAY');

-- ───────────────────────────────── องค์กร & ผู้ใช้
create table organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  timezone    text not null default 'Asia/Bangkok',
  week_starts_on int not null default 1,          -- 1 = จันทร์ (ISO)
  created_at  timestamptz not null default now()
);

create table people (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  name        text not null,
  email       citext,
  role_title  text,
  sort_order  int not null default 0,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (org_id, name)
);

create table users (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  email       citext not null,
  name        text not null,
  role        user_role not null default 'VIEWER',
  person_id   uuid references people(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (org_id, email)
);

-- ───────────────────────────────── ปฏิทินทำงาน
-- ตารางงานประจำ: 1 แถว = 1 คน × 1 วันในสัปดาห์
-- ไม่มีแถว = ไม่ทำงานวันนั้น
create table work_schedules (
  person_id   uuid not null references people(id) on delete cascade,
  weekday     int  not null check (weekday between 1 and 7),   -- ISO: 1=จ, 7=อา
  fraction    numeric(3,2) not null default 1.00
                check (fraction > 0 and fraction <= 1),
  effective_from date not null default '2000-01-01',
  primary key (person_id, weekday, effective_from)
);
comment on table work_schedules is
  'ไม่มีแถวสำหรับ weekday ไหน = คนนั้นไม่ทำงานวันนั้น. พาร์ตไทม์ จ/พ/ศ = 3 แถว';

create table holidays (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  date        date not null,
  name        text not null,
  is_substitute boolean not null default false,   -- วันหยุดชดเชย
  unique (org_id, date)
);

create table time_off_types (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  name        text not null,                      -- 'ลาพักร้อน', 'ลาป่วย', 'ลากิจ', 'อบรม'
  color       text not null default '#94A3B8',
  counts_against_quota boolean not null default true,
  sort_order  int not null default 0,
  unique (org_id, name)
);

create table time_off (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  person_id   uuid not null references people(id) on delete cascade,
  type_id     uuid not null references time_off_types(id),
  start_date  date not null,
  end_date    date not null,
  fraction    numeric(3,2) not null default 1.00  -- 1.00 เต็มวัน, 0.50 ครึ่งวัน
                check (fraction > 0 and fraction <= 1),
  note        text,
  status      text not null default 'APPROVED',   -- Phase 2: 'REQUESTED'|'APPROVED'|'REJECTED'
  created_by  uuid references users(id),
  created_at  timestamptz not null default now(),
  check (end_date >= start_date),
  -- กันลาทับซ้อนของคนเดียวกัน
  exclude using gist (
    person_id with =,
    daterange(start_date, end_date, '[]') with &&
  ) where (status = 'APPROVED')
);
create index on time_off (person_id, start_date, end_date);

-- ───────────────────────────────── งาน
create table clients (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  name        text not null,
  color       text,
  archived_at timestamptz,
  unique (org_id, name)
);

create table projects (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  client_id   uuid references clients(id) on delete set null,
  name        text not null,
  certainty   certainty not null default 'CONFIRMED',
  certainty_note text,
  color       text,
  owner_id    uuid references people(id) on delete set null,
  sort_order  int not null default 0,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (org_id, name)
);

create table sections (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  name        text not null,
  sort_order  int not null default 0
);

create table tasks (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  project_id  uuid not null references projects(id) on delete cascade,
  section_id  uuid references sections(id) on delete set null,
  parent_id   uuid references tasks(id) on delete cascade,
  depth       int  not null default 0 check (depth between 0 and 2),
  name        text not null,
  description text,
  certainty_override certainty,             -- null = สืบทอด
  start_date  date,                         -- ไม่บังคับ ใช้ derive allocation
  due_date    date,
  completed_at timestamptz,                 -- §5.11 null = ยังไม่เสร็จ
  completed_week date generated always as   -- สัปดาห์ที่เสร็จ ใช้ตัดภาระอนาคต
    (date_trunc('week', completed_at)::date) stored,
  sort_order  int not null default 0,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (due_date is null or start_date is null or due_date >= start_date)
);
-- หมายเหตุ: ไม่มีคอลัมน์ assignee บน tasks — task ที่ยังไม่มีคนรับ
-- คือ task ที่ไม่มีแถวใน task_assignments (FR-119)
create index on tasks (project_id, parent_id, sort_order);
create index on tasks (org_id) where archived_at is null;

create table task_assignments (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references tasks(id) on delete cascade,
  person_id   uuid not null references people(id) on delete cascade,
  version     int  not null default 1,      -- optimistic concurrency
  created_at  timestamptz not null default now(),
  unique (task_id, person_id)
);
create index on task_assignments (person_id);

-- ───────────────────────────────── ภาระงาน
create table allocations (
  id                 uuid primary key default gen_random_uuid(),
  task_assignment_id uuid not null references task_assignments(id) on delete cascade,
  granularity        granularity not null,
  period_start       date not null,         -- จันทร์ถ้า WEEK, วันนั้นถ้า DAY
  week_start         date not null,         -- denormalize: สัปดาห์ที่ period นี้อยู่
  person_days        numeric(4,2) not null check (person_days > 0 and person_days <= 7),
  scenario_id        uuid,                  -- null = แผนจริง (Phase 2)
  updated_at         timestamptz not null default now(),
  unique (task_assignment_id, granularity, period_start, scenario_id),
  check (granularity <> 'WEEK' or period_start = week_start),
  check (extract(isodow from week_start) = 1)
);
create index on allocations (week_start, task_assignment_id);
create index on allocations (task_assignment_id, week_start);
```

### 6.3 บังคับ invariant WEEK/DAY ด้วย trigger

```sql
create or replace function enforce_week_day_exclusivity() returns trigger as $$
begin
  if new.granularity = 'WEEK' then
    if exists (select 1 from allocations
               where task_assignment_id = new.task_assignment_id
                 and week_start = new.week_start
                 and granularity = 'DAY'
                 and scenario_id is not distinct from new.scenario_id) then
      raise exception
        'สัปดาห์ % ของ assignment % มีข้อมูลระดับวันอยู่แล้ว — ต้องลบก่อนจึงเขียนระดับสัปดาห์ได้',
        new.week_start, new.task_assignment_id;
    end if;
  else
    if exists (select 1 from allocations
               where task_assignment_id = new.task_assignment_id
                 and week_start = new.week_start
                 and granularity = 'WEEK'
                 and scenario_id is not distinct from new.scenario_id) then
      raise exception
        'สัปดาห์ % ของ assignment % เป็นระดับสัปดาห์อยู่ — ต้องแปลงเป็นระดับวันก่อน',
        new.week_start, new.task_assignment_id;
    end if;
  end if;
  return new;
end $$ language plpgsql;

create trigger trg_week_day_exclusivity
  before insert or update on allocations
  for each row execute function enforce_week_day_exclusivity();
```

> การเปลี่ยน resolution ต้องทำใน transaction เดียว: `DELETE` ของเดิม แล้ว `INSERT` ของใหม่ — ไม่งั้น trigger จะปัดตก

### 6.4 Scenario แบบ overlay (Phase 2)

```sql
create table scenarios (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  name        text not null,
  description text,
  created_by  uuid references users(id),
  created_at  timestamptz not null default now()
);

-- allocation ใน scenario เก็บเฉพาะ "ส่วนที่ต่าง"
-- person_days = 0 หมายถึง "ลบทิ้งใน scenario นี้" (tombstone)
alter table allocations drop constraint allocations_person_days_check;
alter table allocations add check (
  (scenario_id is null and person_days > 0) or
  (scenario_id is not null and person_days >= 0)
);
```

การอ่าน scenario = baseline ทับด้วย overlay:

```sql
create or replace function allocations_in_scenario(p_scenario uuid)
returns setof allocations as $$
  select coalesce(o.*, b.*)
  from allocations b
  full outer join allocations o
    on o.scenario_id = p_scenario
   and o.task_assignment_id = b.task_assignment_id
   and o.granularity = b.granularity
   and o.period_start = b.period_start
  where b.scenario_id is null
  and coalesce(o.person_days, b.person_days) > 0
$$ language sql stable;
```

**ข้อดี:** scenario ที่แตะแค่ 3 task เก็บแค่ 3 แถว ไม่ต้องโคลนทั้งไทม์ไลน์ — ซึ่งเป็นเรื่องจำเป็นเมื่อไทม์ไลน์ไม่มีขอบ

### 6.5 View ช่วยคำนวณ

```sql
-- effective certainty ไล่ขึ้นตามลำดับชั้น
create recursive view v_task_certainty (task_id, project_id, effective_certainty, source) as
  with recursive chain as (
    select t.id as task_id, t.id as node_id, t.parent_id, t.project_id,
           t.certainty_override, 0 as lvl
    from tasks t where t.archived_at is null
    union all
    select c.task_id, p.id, p.parent_id, p.project_id, p.certainty_override, c.lvl + 1
    from chain c join tasks p on p.id = c.parent_id
    where c.certainty_override is null
  )
  select distinct on (task_id)
    c.task_id,
    c.project_id,
    coalesce(c.certainty_override, pr.certainty, 'CONFIRMED'),
    case when c.certainty_override is not null and c.lvl = 0 then 'task'
         when c.certainty_override is not null                then 'ancestor'
         when pr.certainty is not null                        then 'project'
         else 'default' end
  from chain c join projects pr on pr.id = c.project_id
  order by c.task_id, c.lvl;

-- allocation พร้อม certainty และคน — ตัวหลักที่ทุกหน้าใช้
create view v_effective_allocations as
select
  al.id, al.task_assignment_id, al.granularity, al.period_start, al.week_start,
  al.person_days, al.scenario_id,
  ta.person_id, t.id as task_id, t.project_id, p.client_id,
  tc.effective_certainty
from allocations al
join task_assignments ta on ta.id = al.task_assignment_id
join tasks            t  on t.id  = ta.task_id
join projects         p  on p.id  = t.project_id
join v_task_certainty tc on tc.task_id = t.id
where t.archived_at is null
  and p.archived_at is null
  -- §5.11 งานที่เสร็จแล้วไม่กินเวลาในสัปดาห์ถัดจากที่เสร็จ
  and (t.completed_week is null or al.week_start <= t.completed_week);
```

Query รวมภาระรายคนรายสัปดาห์เหลือแค่นี้:

```sql
select person_id, week_start,
       sum(person_days)                                            as total,
       sum(person_days) filter (where effective_certainty='CONFIRMED') as committed
from v_effective_allocations
where scenario_id is null
  and week_start >= $1 and week_start < $2
group by person_id, week_start;
```

### 6.6 Materialized capacity (optimization)

`weekCapacity` ต้องวนวันและเช็ค 3 ตาราง — แพงถ้าเรียกทุก render ให้ทำ materialized view รีเฟรชเมื่อ holidays / work_schedules / time_off เปลี่ยน:

```sql
create materialized view mv_person_week_capacity as
select p.id as person_id, w.week_start,
       sum(day_capacity(p.id, d)) as capacity
from people p
cross join generate_series(
  date_trunc('week', now() - interval '1 year')::date,
  date_trunc('week', now() + interval '2 years')::date,
  '1 week'
) w(week_start)
cross join lateral generate_series(w.week_start, w.week_start + 6, '1 day') d
where p.archived_at is null
group by p.id, w.week_start;

create unique index on mv_person_week_capacity (person_id, week_start);
```

รีเฟรชแบบ `concurrently` ใน background job หลังทุกการแก้ปฏิทิน (debounce 5 วินาที)

### 6.7 เหตุผลของ design decision สำคัญ

| Decision | เหตุผล | ทางเลือกที่ไม่เลือก |
|---|---|---|
| ไม่มี entity `Plan` | ตอบโจทย์ timeline ต่อเนื่อง; ไม่ต้องตัดสินใจว่าอะไรอยู่ plan ไหน | plan แบบ rolling ที่ขยายเอง — ยังต้องมี boundary อยู่ดี |
| `person_days` ไม่ใช่สัดส่วน | ภาระเป็นค่าสัมบูรณ์ เทียบกับ capacity ที่ยืดหดได้ตรง ๆ | เก็บสัดส่วน — กำกวมเมื่อสัปดาห์ไม่เต็ม 5 วัน |
| `granularity` เป็น enum ในตารางเดียว | query รวมง่าย ไม่ต้อง union 2 ตาราง | แยก `week_allocations` / `day_allocations` — invariant ยิ่งบังคับยาก |
| `week_start` denormalize ไว้ในแถว DAY | index เดียวใช้ได้ทั้ง 2 granularity | คำนวณสดตอน query — index ใช้ไม่ได้ |
| Invariant WEEK/DAY บังคับที่ DB | ข้อมูลผิดรูปเข้าไปไม่ได้เลย แม้จะมีบั๊กใน API | บังคับที่ app layer — พังเงียบเมื่อมี path ที่ลืม |
| Scenario เป็น overlay | ไทม์ไลน์ไม่มีขอบ จะโคลนทั้งก้อนไม่ไหว | clone ทั้ง plan (v1.0) |
| วันลาเป็น range ไม่ใช่แถวต่อวัน | ลา 2 สัปดาห์ = 1 แถว, query ด้วย daterange เร็ว | แถวต่อวัน — ข้อมูลบวมและ UI ต้องรวมเอง |
| `exclude using gist` กันลาทับ | DB รับประกัน ไม่ต้องเช็ค race condition ใน app | เช็คใน app — มี race |
| Task depth จำกัด 3 | recursive query มี bound; คนใช้ไม่หลง | ไม่จำกัด — query ระเบิดได้ |

---

## 7. API design

REST ผ่าน Next.js Route Handlers ทุก endpoint scope ด้วย `org_id` จาก session

### 7.1 Types (shared client/server)

```ts
type Certainty    = 'CONFIRMED' | 'TENTATIVE'
type Granularity  = 'WEEK' | 'DAY'
type Scenario     = 'total' | 'committed' | 'at_risk'
type OverloadLevel = 'OK' | 'RISK' | 'OVER'
type OverloadCause = 'WORKLOAD' | 'CAPACITY' | 'BOTH'
type ISODate      = string      // 'YYYY-MM-DD'

interface TimeWindow { from: ISODate; to: ISODate }   // บังคับทุก query ที่แตะ allocation

interface TaskNode {
  id: string
  projectId: string
  sectionId: string | null
  parentId: string | null
  depth: 0 | 1 | 2
  name: string
  startDate: ISODate | null
  dueDate: ISODate | null
  certaintyOverride: Certainty | null
  effectiveCertainty: Certainty
  certaintySource: 'task' | 'ancestor' | 'project' | 'default'
  children: TaskNode[]
  assignments: TaskAssignment[]
  rollupPersonDays: number        // รวมลูกทุกชั้น
}

interface TaskAssignment {
  id: string
  personId: string
  version: number
  weeks: Record<ISODate, WeekAllocation>   // key = วันจันทร์
}

interface WeekAllocation {
  personDays: number
  resolution: Granularity          // 'DAY' = มี detail รายวัน
  days?: Record<ISODate, number>   // มีเมื่อ resolution = 'DAY' หรือขอ expand
}

interface CapacityCell {
  personId: string
  period: ISODate
  granularity: Granularity
  capacity: number                 // person-day
  standardCapacity: number         // ก่อนหักลา/วันหยุด
  timeOff: { typeId: string; typeName: string; color: string; fraction: number }[]
  holiday: { name: string } | null
}

interface WorkloadCell {
  personId: string
  period: ISODate
  granularity: Granularity
  total: number
  committed: number
  atRisk: number
  capacity: number
  utilization: number | null       // null เมื่อ capacity = 0
  status: OverloadLevel
  excess: number
  cause: OverloadCause | null
}
```

### 7.2 Endpoints

```
── โครงงาน ───────────────────────────────────────────────────────────
GET    /api/projects?includeArchived=
POST   /api/projects
PATCH  /api/projects/:id                    (เปลี่ยน certainty ที่นี่)
GET    /api/projects/:id/tree?from=&to=     → TaskNode[] พร้อม allocation ในหน้าต่าง
POST   /api/projects/:id/sections
POST   /api/tasks                           (รับ parentId เพื่อสร้างลูก)
PATCH  /api/tasks/:id                       (ชื่อ, วันที่, certaintyOverride)
POST   /api/tasks/:id/move                  { parentId?, sectionId?, projectId?, sortOrder }
DELETE /api/tasks/:id
POST   /api/tasks/:id/assignees             { personId }
DELETE /api/task-assignments/:id

── ภาระงาน ───────────────────────────────────────────────────────────
GET    /api/allocations?from=&to=&personId=&projectId=&granularity=
PUT    /api/task-assignments/:id/allocations         §7.3
POST   /api/allocations/bulk                          §7.3 (fill / paste / เลื่อนก้อน)
POST   /api/task-assignments/:id/weeks/:week/expand   → แปลง WEEK เป็น DAY
POST   /api/task-assignments/:id/weeks/:week/collapse → แปลง DAY กลับเป็น WEEK
POST   /api/task-assignments/:id/shift                { weeks: ±n, skipNonWorking: true }
POST   /api/tasks/:id/autospread                      กระจายจาก start/due date

── ปฏิทิน & วันลา ────────────────────────────────────────────────────
GET    /api/capacity?from=&to=&granularity=&personId=  → CapacityCell[]
GET    /api/holidays?year=
POST   /api/holidays            /  PATCH /api/holidays/:id  /  DELETE
POST   /api/holidays/import-th?year=       seed วันหยุดไทย
GET    /api/people/:id/schedule /  PUT   /api/people/:id/schedule
GET    /api/time-off?from=&to=&personId=
POST   /api/time-off                                   §7.4
PATCH  /api/time-off/:id        /  DELETE /api/time-off/:id
GET    /api/time-off/calendar?month=                   มุมมองปฏิทินทีม

── วิเคราะห์ ─────────────────────────────────────────────────────────
GET    /api/workload?from=&to=&granularity=&scenario=  → WorkloadCell[]
GET    /api/alerts?from=&to=&level=                    → OverloadAlert[]
GET    /api/summary/projects?from=&to=
GET    /api/summary/team?from=&to=

── อื่น ๆ ────────────────────────────────────────────────────────────
POST   /api/import/xlsx        /  POST /api/import/xlsx/commit
GET    /api/export.xlsx?from=&to=
GET    /api/audit?entity=&entityId=&cursor=
POST   /api/scenarios          /  POST /api/scenarios/:id/merge    [Phase 2]
```

### 7.3 สัญญาของการเขียน allocation

```ts
// PUT /api/task-assignments/:id/allocations
{
  "changes": [
    { "granularity": "WEEK", "period": "2026-09-07", "personDays": 2.5 },
    { "granularity": "DAY",  "period": "2026-09-14", "personDays": 1.0 },
    { "granularity": "WEEK", "period": "2026-09-21", "personDays": null }  // null = ลบ
  ],
  "baseVersion": 41,
  // จำเป็นเมื่อ change ชน resolution เดิม — ไม่ส่งแล้วชน = 409
  "onResolutionConflict": "EXPAND" | "REDISTRIBUTE" | "COLLAPSE"
}

// 200
{
  "version": 42,
  "applied": 3,
  "affectedWeeks": {                     // ส่งค่าใหม่กลับเพื่อ sync client
    "2026-09-07": { "personDays": 2.5, "resolution": "WEEK" },
    "2026-09-14": { "personDays": 3.0, "resolution": "DAY",
                    "days": { "2026-09-14": 1.0, "2026-09-15": 1.0, "2026-09-16": 1.0 } }
  },
  "warnings": [
    { "code": "ALLOCATED_ON_TIME_OFF", "date": "2026-09-16",
      "message": "Peter ลาพักร้อนวันนี้ — มีงาน 1.0 วันวางไว้" }
  ]
}

// 409 — มีคนแก้ก่อน
{ "error": "CONFLICT", "currentVersion": 43, "current": { /* weeks ล่าสุด */ } }

// 409 — resolution ชนและไม่ได้บอกว่าจะทำยังไง
{ "error": "RESOLUTION_CONFLICT", "week": "2026-09-14",
  "currentResolution": "DAY",
  "options": ["EXPAND", "REDISTRIBUTE", "COLLAPSE"] }
```

**กติกา concurrency:** `version` อยู่ที่ระดับ `task_assignment`, bump ทุกครั้งที่เขียน ถ้าชน → client merge แล้วลองใหม่ ห้าม overwrite เงียบ

### 7.4 สัญญาของการบันทึกวันลา

```ts
// POST /api/time-off
{ "personId": "...", "typeId": "...",
  "startDate": "2026-10-12", "endDate": "2026-10-13",
  "fraction": 1.0, "note": "พักร้อนประจำปี" }

// 200 — สำเร็จ แต่ต้องบอกผลกระทบ
{
  "id": "...",
  "capacityImpact": [
    { "week": "2026-10-12", "before": 5.0, "after": 3.0 }
  ],
  "newOverloads": [                      // FR-56 — ต้องแจ้ง ไม่ใช่เงียบ
    { "week": "2026-10-12", "level": "OVER", "excess": 2.0, "cause": "CAPACITY",
      "tasks": [ { "id": "...", "name": "ย้าย pipeline", "personDays": 5.0 } ] }
  ],
  "allocationsOnTimeOffDays": [
    { "date": "2026-10-12", "taskId": "...", "personDays": 1.0 }
  ]
}
```

UI ต้องแสดงผลกระทบนี้ทันทีพร้อมปุ่มลัด `[เลื่อนงานไปสัปดาห์ถัดไป]` — **ไม่แก้ allocation อัตโนมัติ** (§5.6)

### 7.5 Debounce & optimistic update

- พิมพ์ในเซลล์ → optimistic update ใน store ทันที
- debounce 400ms → ยิง batch ของ change ที่ค้าง
- เปลี่ยนโฟกัสออกจากกริด / `Cmd+S` → flush ทันที
- request fail → rollback เซลล์นั้น + toast + ปุ่ม retry
- `RESOLUTION_CONFLICT` → ไม่ rollback แต่เปิด dialog §5.5

---

## 8. Frontend design

### 8.1 Stack

| ชั้น | เลือกใช้ | เหตุผล |
|---|---|---|
| Framework | Next.js 15 App Router + TypeScript strict | RSC ทำให้ initial payload เล็ก |
| Styling | Tailwind CSS + CSS variables | ต้องคุม palette ให้ตรง Excel |
| Component | shadcn/ui (Radix) | accessible ตั้งแต่ต้น |
| Server state | TanStack Query | cache + optimistic + retry ครบ |
| Grid state | Zustand แยก store สำหรับ selection/editing | เลี่ยง re-render ทั้งกริด |
| Virtualization | TanStack Virtual (2 แกน) | timeline ไม่มีขอบ = ต้อง virtualize แนวนอนด้วย |
| Table | TanStack Table (headless) | ต้องคุม DOM เอง |
| Drag | dnd-kit | ย้าย task ข้าม section / ลากแถบงาน |
| Date | date-fns + date-fns-tz | tree-shake ได้ ไม่ลาก moment |
| Charts | Recharts | สรุปรายสัปดาห์ |
| Forms | react-hook-form + zod | zod schema ใช้ร่วมกับ API |
| DB | Drizzle ORM | type-safe, migration ตรงไปตรงมา |
| Auth | Auth.js — Google + magic link | |
| Jobs | Trigger.dev หรือ pg-boss | refresh materialized view, ส่งแจ้งเตือน |
| Test | Vitest + Playwright | |

### 8.2 แผนผังหน้าจอ

```
/                        → Planner — กริดกำลังคน (หน้า default, ตอบคำถามหลักทันที §1.5 ข้อ 6)
/list                    → มุมมองลิสต์ (ข้อมูลชุดเดียวกัน คนละการนำเสนอ)
/board                   → มุมมองบอร์ด                              [Phase 2]
/timeline                → Timeline รายคน
/workload                → Workload heatmap
/projects                → สรุปรายโปรเจค
/projects/[id]           → โปรเจคเดียว (เปิดในมุมมองไหนก็ได้)
/alerts                  → แจ้งเตือน overload
/calendar                → ปฏิทินทีม: วันลา + วันหยุด
/me                      → งานของฉัน + แจ้งลา
/settings/people         → ทีม + work schedule
/settings/holidays       → วันหยุดองค์กร
/settings/time-off-types
/settings/members        → user & role

?task=<id>               → query param เปิด task detail panel ทับมุมมองไหนก็ได้
```

**กฎการนำทาง:** `/`, `/list`, `/board` คือมุมมอง 3 แบบของข้อมูลชุดเดียวกัน — สลับกันแล้ว filter, ช่วงเวลา และ task ที่เลือกอยู่ต้องคงเดิม (FR-117) เก็บ state ไว้ใน URL เพื่อให้ copy ลิงก์แล้วคนอื่นเห็นเหมือนกัน

### 8.3 หน้า Planner — โครงหลัก

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ ◀ ก.ย. 2026 ▶  [วันนี้]   Zoom: [ไตรมาส][เดือน]▸[สัปดาห์]   ⚙ หน่วย: วัน ▾      │
│ มุมมอง: [ทั้งหมด▾] [เฉพาะยืนยันแล้ว] [ส่วนต่าง]   🔍 Filter   👥 จัดกลุ่ม: โปรเจค▾│
├───────────────────────────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬───────────┤
│                           │31 ส.ค│ 7 ก.ย│14 ก.ย│21 ก.ย│28 ก.ย│ 5 ต.ค│12 ต.ค│  รวม  │
├───────────────────────────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼───────────┤
│ ▼ 🟦 Coral                                                                        │
│   ▼ POS Upgrade            ● แน่นอน                                              │
│     ▼ 📁 Build                                                                   │
│       ▾ ปรับปรุงระบบ POS                                                          │
│           Cindy              5.0  5.0  3.8  2.5  2.5                      18.8     │
│                                      ⋯                                           │
│       ▸ ทำ UAT + คู่มือ      ● แน่นอน                                              │
│           Ivy                   2.5  2.5  2.5  1.3                       8.8     │
│     ▼ 📁 Rollout                                                                 │
│       ▸ Rollout สาขา        ◐ อาจไม่ทำ*                                           │
│           Mint                                        2.5  3.8           14.0     │
│   ▼ Data Warehouse         ● แน่นอน                                              │
│       ▸ ย้าย pipeline                                                            │
│           Peter          2.5  2.5  3.8  5.0  ▨▨▨  5.0  3.8            25.0     │
│                                                 ลา 2 วัน                          │
├───────────────────────────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼───────────┤
│ ภาระทีมรวม                  7.5 10.0 12.5 13.8 16.3 18.8 17.5          195.0     │
│ Capacity ทีม               25.0 25.0 25.0 25.0 23.0 25.0 25.0                    │
│ % การใช้กำลังคน             30%  40%  50%  55%  71%  75%  70%                    │
└─────────────────────────────────────────────────────────────────────────────────┘
   ⋯ = สัปดาห์นี้มีรายละเอียดระดับวัน   ▨ = วันลา   * = override ระดับ task
```

**องค์ประกอบสำคัญ**

| ส่วน | รายละเอียด |
|---|---|
| คอลัมน์ซ้าย | tree ซ้อนชั้น client → project → section → task → person, collapse ได้ทุกชั้น |
| แถวชั้นบน | แสดงผลรวมของลูก (read-only, สีจาง) — แก้ได้เฉพาะแถว person |
| Certainty badge | อยู่ที่แถว project และ task; `*` = override; hover เห็นว่าสืบทอดจากไหน |
| แถบวันลา | `▨` ลายทางเฉียง + tooltip; ทับทั้งคอลัมน์ของคนนั้น |
| แถวล่าง (sticky) | ภาระทีมรวม / capacity / % — capacity เปลี่ยนตามวันลาให้เห็นชัด |
| Infinite scroll แนวนอน | โหลดสัปดาห์เพิ่มเมื่อ scroll ถึงขอบ; ปุ่ม "วันนี้" กระโดดกลับ |

### 8.4 การ zoom เข้าระดับวัน

คลิกหัวคอลัมน์สัปดาห์ หรือกด `Cmd+↓` บนเซลล์ → คอลัมน์นั้นขยายเป็น 5–7 วัน แบบ inline (ไม่เปลี่ยนหน้า)

```
│                    │  14 ก.ย. 2026                      │21 ก.ย│
│                    │  จ   อ   พ   พฤ  ศ                 │      │
├────────────────────┼───┬───┬───┬───┬───┼────────────────┼──────┤
│  Cindy               │1.0│1.0│1.0│0.8│ · │  ← วางจริง      │ 2.5  │
│  Peter           │0.8│0.8│▨▨▨│▨▨▨│0.8│  ← ลา พ–พฤ     │ 5.0  │
│  Ivy               │╌╌╌│╌╌╌│╌╌╌│╌╌╌│╌╌╌│  ← กระจายอัตโนมัติ│ 2.5  │
│                    │0.5│0.5│0.5│0.5│0.5│                │      │
```

- แถวที่เป็นเส้นประ = resolution `WEEK` (ค่ากระจายให้ดู) — แก้เมื่อไหร่ก็แปลงเป็น `DAY` อัตโนมัติ
- แถวทึบ = resolution `DAY`
- ปุ่ม `↕ กลับเป็นระดับสัปดาห์` ที่หัวแถวเมื่อ resolution = DAY
- ลากขอบซ้าย/ขวาของแถบงาน → ขยาย/หดเป็นรายวัน โดยข้ามวันลาและวันหยุดอัตโนมัติ

### 8.5 Keyboard

| คีย์ | ผล |
|---|---|
| ลูกศร | ขยับ selection |
| `Shift + ลูกศร` | ขยายช่วงเลือก |
| พิมพ์ตัวเลข | เริ่มแก้ทันที (ไม่ต้องดับเบิลคลิก) |
| `1` `7` `5` `2` | shortcut เต็ม / 0.75 / ครึ่ง / 0.25 ของ capacity สัปดาห์นั้น |
| `0` `Delete` | ล้างค่า |
| `Enter` | ยืนยัน + ลงแถวถัดไป |
| `Tab` | ยืนยัน + ไปขวา |
| `Esc` | ยกเลิกการแก้ |
| `Cmd + ↓` | zoom เข้าระดับวันของสัปดาห์ที่เลือก |
| `Cmd + ↑` | collapse กลับระดับสัปดาห์ |
| `Cmd + →` / `←` | เลื่อนแถบงานทั้งก้อน ±1 สัปดาห์ |
| `Cmd + Z` / `Shift+Cmd+Z` | undo / redo |
| `Cmd + C` / `V` | copy/paste TSV (เข้ากับ Excel) |
| `Cmd + K` | command palette — ค้นหา task/คน/โปรเจค |

### 8.6 หน้า Workload heatmap

- ตาราง คน × เวลา; Zoom เดียวกับ Planner
- Segmented control: `ถ้าทำทุกอย่าง` | `เฉพาะยืนยันแล้ว` | `ส่วนต่าง`
- เซลล์แสดง `ภาระ / capacity` เช่น `5.0/3.0` เมื่อ overload
- Hover tooltip:
  ```
  Peter · สัปดาห์ 12 ต.ค.
  ภาระทั้งหมด     5.0 วัน
  ยืนยันแล้ว      5.0 วัน
  ยังไม่ชัวร์        0.0 วัน
  ─────────────────────────
  Capacity       3.0 วัน  (มาตรฐาน 5.0 − ลาพักร้อน 2.0)
  🔴 เกิน 2.0 วัน — สาเหตุ: capacity หดจากวันลา
  ```
- คลิก → side panel ลิสต์ task ที่ประกอบเป็นตัวเลขนั้น + ปุ่มลัดแก้
- แถวล่าง: ทีมรวม, capacity ทีม, % การใช้กำลังคน, จำนวนคนที่ overload

### 8.7 หน้า Calendar (ปฏิทินทีม)

มุมมองเดือน แสดงวันลาทุกคนซ้อนกัน + วันหยุดองค์กร

```
        จ       อ       พ       พฤ      ศ      ส  อา
  5 ต.ค  ·       ·       ·       ·       ·      ▨  ▨
 12 ต.ค  🏖Peter ────┤  ·       ·       ·      ▨  ▨
 19 ต.ค  ·       ·      🎌วันปิยะ  ·       ·      ▨  ▨
 26 ต.ค  🏖Cindy ──────────────────────────┤      ▨  ▨
```

- คลิกช่วงว่าง → สร้างวันลาเร็ว
- Badge เตือนสีแดงบนวันลาที่ทำให้เกิด overload
- Filter รายคน / รายประเภทการลา

### 8.8 หน้า Alerts

| Person | ช่วง | ระดับ | เกิน | สาเหตุ | |
|---|---|---|---|---|---|
| Peter | 12 ต.ค. | 🔴 OVER | +2.0 | 🏖 capacity หด (ลา 2 วัน) | [แก้] |
| Cindy | 31 ส.ค. | 🔴 OVER | +0.5 | 📈 งานเยอะ (POS 5.0 + DW 0.5) | [แก้] |
| Mint | 5 ต.ค. | 🟡 RISK | +0.25 | CRM Migration 0.75 (อาจไม่ทำ) | [แก้] |

- KPI cards: `ล้นแน่ ๆ` / `เสี่ยง` / `คนที่ล้นบ่อยสุด` / `สัปดาห์ที่หนักสุด`
- Filter ตามระดับ / สาเหตุ / คน
- `[แก้]` → เปิด Planner พร้อม scroll + highlight เซลล์นั้น

### 8.9 Design tokens

```css
:root {
  /* brand — ยกมาจาก Excel template */
  --navy:        #1F3864;
  --navy-mid:    #2F5597;
  --blue-light:  #D9E2F3;
  --yellow-input:#FFF2CC;

  /* load bands */
  --load-over-bg:  #FFC7CE;  --load-over-fg:  #9C0006;
  --load-full-bg:  #C6EFCE;  --load-full-fg:  #006100;
  --load-light-bg: #FFEB9C;  --load-light-fg: #9C6500;

  /* heatmap scale */
  --heat-0: #FFFFFF;  --heat-50: #BDD7EE;  --heat-100: #2E75B6;

  /* certainty */
  --certain-bg:   #E2EFDA;  --certain-fg:   #006100;
  --tentative-bg: #FFEB9C;  --tentative-fg: #9C6500;

  /* ปฏิทิน */
  --nonworking:   #F1F5F9;   /* เสาร์อาทิตย์ */
  --holiday:      #E2E8F0;   /* วันหยุดองค์กร */
  --timeoff:      #CBD5E1;   /* วันลา — ใช้ลายทางเฉียงร่วมด้วย */
  --today-line:   #EF4444;
}
```

**Accessibility**

- ห้ามสื่อสารสถานะด้วยสีอย่างเดียว — ทุกเซลล์ over/risk มีตัวเลขหรือไอคอนกำกับ, วันลาใช้ลายทาง ไม่ใช่แค่สีเทา
- กริดต้องมี `role="grid"` + `aria-rowindex/colindex` และใช้งานด้วยคีย์บอร์ดล้วนได้ครบ
- Contrast ratio ≥ 4.5:1 ทั้ง light และ dark mode
- ประกาศการเปลี่ยนแปลงผ่าน `aria-live` เมื่อเกิด overload ใหม่จากการกระทำของผู้ใช้

### 8.10 มุมมองลิสต์และบอร์ด

ทั้งสองมุมมองอ่านจาก API เดียวกับกริด ต่างกันแค่การนำเสนอ

**ลิสต์** (`/list`) — สำหรับตอนที่อยากเห็น task เป็นรายการยาว ๆ มากกว่าเป็นกริดเวลา

```
┌──────────────────────────────────────────────────────────────────────────┐
│ + เพิ่มงาน…                        จัดกลุ่ม: โปรเจค▾   เรียง: กำหนดส่ง▾   │
├──────────────────────────────────────────────────────────────────────────┤
│ ▼ POS Upgrade · Coral                                    ● แน่นอน  46.3 วัน│
│   ☐ ปรับปรุงระบบ POS            Cindy      31 ส.ค.–28 ก.ย.          18.8 วัน│
│      ☐ ทำ UAT + คู่มือ           Ivy      14 ก.ย.–5 ต.ค.            8.8 วัน│
│   ☐ Rollout สาขา               Mint      ◐ อาจไม่ทำ                14.0 วัน│
│   ☐ เตรียมสื่อฝึกอบรม           — รอมอบหมาย —                        0 วัน│
│ ▼ Data Warehouse · Coral                                 ● แน่นอน  25.0 วัน│
│   ☑ สำรวจ schema เดิม           Peter  เสร็จ 7 ก.ย.               2.5 วัน│
└──────────────────────────────────────────────────────────────────────────┘
```

- จัดกลุ่มได้ตาม: โปรเจค / คน / ลูกค้า / ความแน่นอน / สัปดาห์ที่เริ่ม
- คอลัมน์แก้ inline ได้ทุกช่อง; `+ เพิ่มงาน…` อยู่บนสุดเสมอ พิมพ์แล้ว Enter จบ
- Task ที่ยังไม่มีคนรับขึ้น `— รอมอบหมาย —` สีจาง **ไม่ซ่อน** (FR-119)
- `☑` = เสร็จแล้ว ขีดฆ่า + ซ่อนเมื่อปิด toggle

**บอร์ด** (`/board`, Phase 2) — คอลัมน์ = section ของโปรเจค, การ์ด = task
ใช้ตอนจัดระเบียบงานในโปรเจคเดียว ไม่ใช่ตอนดูภาระทีม
การ์ดแสดง: ชื่อ, avatar คนรับ, person-day รวม, badge ความแน่นอน

> **เหตุผลที่บอร์ดอยู่ Phase 2 ไม่ใช่ MVP:** บอร์ดตอบคำถาม "งานอยู่ขั้นไหน" ซึ่งเป็นคำถาม tracking ไม่ใช่ planning — ไม่ใช่คำถามหลักของระบบนี้ (§1.4) แต่คนที่ย้ายมาจาก Asana จะคุ้นมือ จึงควรมี แค่ไม่ใช่สิ่งแรก

### 8.11 Task detail panel

เลื่อนออกมาจากขวา **กว้าง ~420px ไม่ทับกริด** (กริดหดแทน) — ปิดด้วย `Esc`

```
┌───────────────────────────────────┐
│ ปรับปรุงระบบ POS หน้าร้าน        ✕ │   ← แก้ชื่อได้ตรงนี้
├───────────────────────────────────┤
│ โปรเจค     POS Upgrade · Coral  ▾  │
│ Section    Build               ▾  │
│ ความแน่นอน  ตามโปรเจค (แน่นอน) ▾  │   ← hover เห็นว่าสืบทอดจากไหน
│ ช่วงเวลา    31 ส.ค. – 28 ก.ย.     │
├───────────────────────────────────┤
│ ผู้รับผิดชอบ                        │
│  Cindy        18.8 วัน   ▸ ดูรายสัปดาห์│
│  + เพิ่มคน                          │
├───────────────────────────────────┤
│ งานย่อย                            │
│  ☐ ทำ UAT + คู่มือ    Ivy   8.8 วัน │
│  + เพิ่มงานย่อย                     │
├───────────────────────────────────┤
│ 📝 รายละเอียด                      │
│ …                                  │
├───────────────────────────────────┤
│ ☐ ทำเสร็จแล้ว          🗑 ลบงานนี้  │
└───────────────────────────────────┘
```

Panel เป็น **ทางเลือก ไม่ใช่ทางบังคับ** (§1.5 ข้อ 3) — ทุกอย่างในนี้ยกเว้นรายละเอียดยาว ๆ แก้ได้จากกริดหรือลิสต์โดยตรง

---

## 9. Import / Export

### 9.1 Import จาก Excel เดิม

Pipeline: `upload → parse (SheetJS) → map → validate → preview → commit (1 transaction)`

**การแปลงหน่วยที่ต้องระวัง**

```
Excel เก็บสัดส่วน 0–1 ของสัปดาห์ → ต้องแปลงเป็น person-day
  person_days = fraction × 5.0        (สมมติสัปดาห์มาตรฐาน)

⚠️ ไม่หักวันหยุดตอน import เพราะ Excel เดิมไม่รู้จักวันหยุด
   ถ้าหักจะทำให้ตัวเลขไม่ตรงกับไฟล์ต้นทาง ตรวจสอบยาก
   → import เป็น 5.0 ก่อน แล้วให้ระบบชี้ว่าสัปดาห์ไหนเกิน capacity จริง
```

**Mapping**

| Excel | ปลายทาง |
|---|---|
| Setup คอลัมน์ B | `people` |
| Setup คอลัมน์ D | `clients` |
| Setup คอลัมน์ F + G | `projects` (ชื่อ + certainty) |
| Plan คอลัมน์ C (Description) | `tasks.name` (depth 0, ไม่มี section) |
| Plan คอลัมน์ D | `task_assignments.person_id` |
| Plan คอลัมน์ E | `tasks.certainty_override` |
| Plan กริด F:W | `allocations` granularity `WEEK` |

หน้า preview ต้องแสดง: คน/โปรเจคที่ยังไม่มีในระบบ (เลือกสร้างใหม่หรือ map), ค่านอกช่วง, สรุปจำนวนที่จะสร้าง

### 9.2 Export

ใช้ **ExcelJS** (เขียน style + conditional formatting ได้)

- Export ตามหน้าต่างเวลาที่ผู้ใช้เลือก (ไทม์ไลน์ไม่มีขอบ จึงต้องระบุช่วงเสมอ)
- **Export เป็นค่าดิบไม่มีสูตร** — ให้สีมาจาก conditional formatting; ไม่ต้อง maintain สูตร 2 ชุด
- เพิ่มชีต `ปฏิทิน` ที่ไม่มีใน template เดิม: วันลาและวันหยุดของแต่ละคน เพื่อให้คนที่เปิดไฟล์เข้าใจว่าทำไม capacity บางสัปดาห์ไม่ใช่ 5.0

---

## 10. Non-functional requirements

| ด้าน | เป้า |
|---|---|
| **Performance** | โหลดหน้าต่าง 16 สัปดาห์ × 50 คน < 800ms p95; แก้เซลล์ → เห็นผล < 50ms (optimistic); zoom เข้าระดับวัน < 200ms |
| **Scale** | 1 org / 50 คน / 200 โปรเจค / 5,000 task / ข้อมูล 3 ปี โดยไม่ต้อง shard |
| **Query discipline** | ทุก query ที่แตะ `allocations` ต้องมี window เสมอ — เขียน lint rule / test ตรวจ |
| **Availability** | internal tool — 99.5% พอ |
| **i18n** | ไทยเป็นหลัก โครงสร้างรองรับอังกฤษ (next-intl); วันที่แบบไทย; ปี พ.ศ. เป็น option |
| **Timezone** | `Asia/Bangkok`; ทุกอย่างเป็น `DATE` ล้วน ไม่มี timestamp ในข้อมูลแผน |
| **Accessibility** | WCAG 2.1 AA |
| **Browser** | Chrome / Edge / Safari 2 เวอร์ชันล่าสุด; responsive ถึง tablet; มือถือ = read-only + แจ้งลา |
| **Security** | scope ด้วย `org_id` ทุก query; rate limit API เขียน; Member เห็นและแก้ได้เฉพาะวันลาตัวเอง |
| **Retention** | audit log 2 ปี; soft delete ไม่ purge อัตโนมัติ |
| **Backup** | daily snapshot + PITR 7 วัน |

---

## 11. Roadmap

### Phase 1 — MVP (ประเมิน 7–9 สัปดาห์)

> เป้า: เลิกใช้ Excel ได้จริง พร้อมความสามารถใหม่ที่ Excel ทำไม่ได้ (วันลา + รายวัน + ลำดับชั้น)

**1a — ฐานราก + มุมมองลิสต์ (3 สัปดาห์)**
- [ ] Auth + org + role
- [ ] CRUD people / clients / projects / sections / tasks (ซ้อนชั้น)
- [ ] **Quick add** — สร้าง task ด้วยชื่ออย่างเดียว ไม่มี modal (FR-110, 111)
- [ ] **มุมมองลิสต์** + จัดกลุ่ม/เรียง/แก้ inline (FR-114)
- [ ] **Task detail panel** (FR-118)
- [ ] **ติ๊กเสร็จ** + กฎการตัดภาระอนาคต §5.11
- [ ] Certainty + การสืบทอดผ่านลำดับชั้น
- [ ] Work schedule + วันหยุดองค์กร + seed วันหยุดไทย
- [ ] Time off CRUD + สูตร capacity §5.6
- [ ] Materialized capacity view + job รีเฟรช

> ตอนจบ 1a ต้องใช้แทน Asana ได้ในระดับ "จดงานและมอบหมาย" แล้ว แม้ยังไม่มีกริด

**1b — กริดวางแผน (3–4 สัปดาห์)** ← งานหนักสุด
- [ ] Timeline ต่อเนื่อง + virtualize 2 แกน + infinite scroll แนวนอน
- [ ] Zoom 3 ระดับ
- [ ] กริดแก้ค่าระดับสัปดาห์ + keyboard เต็มรูป + fill
- [ ] **กลไก WEEK ↔ DAY §5.5** (expand / collapse / redistribute dialog)
- [ ] แถบวันลา/วันหยุดในกริด
- [ ] ลากแถบงานเลื่อนสัปดาห์ (ข้ามวันหยุด)
- [ ] Auto-spread จาก start/due date

**1c — วิเคราะห์และ I/O (2 สัปดาห์)**
- [ ] Workload heatmap 3 โหมด
- [ ] Alerts แยก OVER / RISK + แยกสาเหตุ WORKLOAD / CAPACITY
- [ ] Timeline รายคน + สรุปรายโปรเจค + ปฏิทินทีม
- [ ] เตือนตอนบันทึกลาทับงาน §7.4
- [ ] Command palette `Cmd+K` (FR-120)
- [ ] Import xlsx + Export xlsx
- [ ] Audit log (เขียนอย่างเดียว)

**Definition of done:** import `Workload_Planner_Aug-Dec_2026_v2.xlsx` แล้วทุกตัวเลขสรุปตรงกับ Excel ทุกช่อง (โดยตั้ง capacity = 5.0 ทุกสัปดาห์และไม่มีวันลา)

### Phase 2 — ใช้จริงสบาย (4–6 สัปดาห์)

- [ ] **มุมมองบอร์ด** (FR-116)
- [ ] **Import จาก Asana / CSV** ครั้งเดียวตอนย้ายระบบ (FR-122)
- [ ] **Multi-select + bulk action** (FR-121)
- [ ] Scenario overlay: สร้าง / เทียบ / merge
- [ ] Toggle เปิด-ปิดโปรเจคชั่วคราว
- [ ] Undo/redo + copy/paste TSV
- [ ] Realtime multi-user + presence
- [ ] Approval flow ของ **วันลา** + โควตาคงเหลือ (ไม่ใช่ approval ของแผน — §1.4)
- [ ] Tag + saved view + แชร์ลิงก์
- [ ] Comment ระดับ task + เหตุผลตอนเปลี่ยน certainty
- [ ] Audit log UI + diff viewer
- [ ] Capacity forecast — สัปดาห์ไหนรับงานใหม่ได้
- [ ] Duplicate task พร้อม allocation
- [ ] Export CSV / PNG

### Phase 3 — ฉลาดขึ้น

- [ ] Certainty เป็น % ความน่าจะเป็น → expected load
- [ ] Skill matching + แนะนำคนที่รับงานได้
- [ ] Auto-suggest วิธีแก้ overload
- [ ] แจ้งเตือน Slack/email (เฉพาะที่ต้องลงมือ — §1.5 ข้อ 5)
- [ ] Sync วันลาจาก Google Calendar / HR
- [ ] Checklist ย่อยใน task (FR-123)
- [ ] Template โปรเจค
- [ ] PWA read-only สำหรับสมาชิกทีม

> **ตัดออกจาก roadmap เดิม:** "Sync task จาก Jira / Asana" — เมื่อระบบนี้เป็นเครื่องมือหลักแล้ว การ sync สองทางจะลากความซับซ้อนของ Asana กลับเข้ามาทั้งหมด (field mapping, conflict resolution, สถานะที่ไม่ตรงกัน) เหลือแค่ **import ครั้งเดียว** ใน Phase 2 ก็พอ

---

## 12. Test plan

### 12.1 Unit — calculation engine

```ts
describe('effectiveCertainty', () => {
  it('override ของ task ชนะทุกอย่าง')
  it('ไล่ขึ้น parent ตัวแรกที่มี override')
  it('ตกไปใช้ project เมื่อทั้งสายไม่มี override')
  it('default CONFIRMED เมื่อไม่มีอะไรเลย')
  it('ย้าย task ข้าม project แล้ว certainty เปลี่ยนตามปลายทาง')
})

describe('capacity', () => {
  it('จ–ศ ปกติ = 5.0')
  it('ลาพักร้อน 2 วัน = 3.0')
  it('ลาครึ่งวัน = 4.5')
  it('พาร์ตไทม์ จ/พ/ศ = 3.0')
  it('พาร์ตไทม์ + ลาวันพุธ = 2.0')
  it('วันหยุดนักขัตฤกษ์ทับวันลา ไม่หักซ้ำ')       // ★ กรณีพลาดง่าย
  it('ลาทั้งสัปดาห์ = 0 และ utilization เป็น null ไม่ใช่ Infinity')
})

describe('week ↔ day', () => {
  it('กระจายลงวันตามสัดส่วน capacity')
  it('ไม่กระจายลงวันที่ลา (dayCapacity=0)')
  it('expand แล้วผลรวมสัปดาห์เท่าเดิม')          // ★ invariant
  it('collapse แล้วผลรวมสัปดาห์เท่าเดิม')          // ★ invariant
  it('redistribute แบบสัดส่วน clamp ไม่ให้วันใดเกิน dayCapacity')
  it('เขียน WEEK ทับสัปดาห์ที่มี DAY → error ไม่ใช่เขียนทับเงียบ')
})

describe('load aggregation', () => {
  it('committed ≤ total เสมอ')                    // property-based
  it('at_risk = total − committed')
  it('Σ dayLoad = weekLoad ไม่ว่า resolution จะเป็นอะไร')   // ★ property-based
  it('task แม่รวมภาระของลูกทุกชั้น')
  it('ไม่นับ task/project ที่ archived')
})

describe('completed tasks', () => {                 // §5.11
  it('ติ๊กเสร็จ → ภาระสัปดาห์ถัดไปหาย แต่สัปดาห์ที่เสร็จยังนับ')
  it('ติ๊กเสร็จ → overload ที่เกิดจาก task นี้ในอนาคตคลายออก')
  it('un-check → ภาระกลับมาครบเหมือนเดิม (ไม่ได้ลบ allocation ทิ้ง)')
  it('task แม่เสร็จแต่ลูกยังไม่เสร็จ → ลูกยังนับภาระ')
})

describe('unassigned tasks', () => {                // FR-119
  it('task ที่ไม่มีคนรับ ไม่ทำให้ใคร overload')
  it('task ที่ไม่มีคนรับ ยังโผล่ในลิสต์และในผลรวมของโปรเจค')
})

describe('overloadStatus', () => {
  it('committed 6.0 / cap 5.0 → OVER 1.0 cause WORKLOAD')
  it('committed 5.0 / cap 3.0 (ลา 2 วัน) → OVER 2.0 cause CAPACITY')   // ★
  it('committed 6.0 / cap 3.0 → OVER 3.0 cause BOTH')
  it('committed 0, total 6.0 / cap 5.0 → RISK 1.0')
  it('committed 5.0 / cap 5.0 → OK (พอดีไม่นับว่าเกิน)')
})
```

### 12.2 Golden-file test

Fixture = `Workload_Planner_Aug-Dec_2026_v2.xlsx`, ตั้ง capacity 5.0 ทุกสัปดาห์ ไม่มีวันลา:

| ค่า | คาดหวัง |
|---|---|
| จำนวน task | 10 |
| รวมทั้งหมด | 39.00 สัดส่วน = **195.0 person-day** |
| รวมเฉพาะยืนยันแล้ว | 23.25 สัดส่วน = **116.25 person-day** |
| POS Upgrade total / committed | 9.25 / 5.50 → 46.25 / 27.50 person-day |
| CRM Migration total / committed | 5.00 / 0.00 → 25.0 / 0.0 person-day |
| จำนวนช่อง OVER / RISK | 0 / 0 |

Fixture ที่สอง: เพิ่มวันลา Peter 2 วันในสัปดาห์ที่เขาถูกวางไว้ 5.0 → assert `OVER +2.0 cause=CAPACITY`

### 12.3 E2E (Playwright)

```
 1. login → เห็นไทม์ไลน์ที่สัปดาห์ปัจจุบัน
 2. import xlsx → preview → commit → ตัวเลขตรง golden file
 3. สร้าง project → section → task → task ลูก → มอบหมายคน → ใส่ค่า
 4. แก้เซลล์ด้วยคีย์บอร์ดล้วน → reload แล้วยังอยู่
 5. zoom เข้าระดับวัน → แก้วันพุธ → ผลรวมสัปดาห์อัปเดตถูก → zoom ออกเห็นเครื่องหมาย ⋯
 6. แก้ยอดรวมสัปดาห์ที่มี detail รายวัน → dialog ขึ้น → เลือก "ขยายตามสัดส่วน" → ค่าถูก
 7. collapse กลับระดับสัปดาห์ → ยอดรวมไม่เปลี่ยน detail หาย
 8. บันทึกวันลา 2 วัน → capacity ลด → alert OVER ขึ้นพร้อมสาเหตุ "capacity หด"
 9. กด "เลื่อนงานไปสัปดาห์ถัดไป" จาก alert → overload หาย
10. เปลี่ยน certainty ของ project → heatmap ฉาก committed เปลี่ยนทันที ไม่ reload
11. ใส่ override ที่ task แม่ → ลูกทุกตัวเปลี่ยนตาม; ใส่ที่ลูก → ทับของแม่
12. ลากแถบงานไป 2 สัปดาห์ → ข้ามสัปดาห์ที่ลาทั้งสัปดาห์
13. scroll แนวนอนไปข้างหน้า 6 เดือน → ข้อมูลโหลดเพิ่ม ไม่ค้าง
14. export xlsx → เปิดแล้วตัวเลขตรงกับบนเว็บ
15. สร้าง task ด้วยชื่ออย่างเดียว → บันทึกได้ ไม่มี validation error   ★ §1.5 ข้อ 2
16. สลับ กริด → ลิสต์ → กลับมา: filter, ช่วงเวลา, task ที่เลือก คงเดิม  ★ FR-117
17. ติ๊กเสร็จ task ที่มีภาระในอนาคต → toast บอกว่าปลดกี่วัน → undo แล้วกลับมาครบ
18. `Cmd+K` พิมพ์ชื่อ task → Enter → กระโดดไปที่ task นั้นในมุมมองปัจจุบัน
```

### 12.5 Usability test (เกณฑ์วัดคำว่า "ง่ายกว่า")

ทดสอบกับคนที่ไม่เคยเห็นระบบ 5 คน ก่อนปิด MVP:

| งานที่ให้ทำ | เกณฑ์ผ่าน |
|---|---|
| สร้างโปรเจคใหม่พร้อม 3 task และมอบหมายคน | < 2 นาที ไม่ต้องถาม |
| ตอบว่า "สัปดาห์หน้าใครว่างที่สุด" | < 30 วินาที จากหน้าแรก ไม่เกิน 2 คลิก |
| บันทึกวันลาของตัวเอง | < 1 นาที |
| อธิบายว่า "อาจไม่ทำ" ต่างจาก "แน่นอน" ยังไง | ตอบถูกโดยไม่ต้องอ่านคู่มือ |
| หา task ที่ทำให้ตัวเอง overload | < 1 นาที |

ถ้าข้อไหนไม่ผ่านกับคน 2 ใน 5 → ถือเป็น blocker ของ MVP ไม่ใช่ backlog

### 12.4 Performance test

- Seed 50 คน × 200 โปรเจค × 5,000 task × 3 ปี
- Assert: `GET /api/workload` 16 สัปดาห์ < 800ms p95
- Assert: scroll แนวนอนต่อเนื่อง 2 นาที ไม่มี memory leak (heap ไม่โตเกิน 20%)

---

## 13. Migration plan

| ขั้น | ทำอะไร | เกณฑ์ผ่าน |
|---|---|---|
| 1 | Deploy MVP staging, import ไฟล์จริง | ตัวเลขตรง Excel ทุกช่อง |
| 2 | ใส่วันหยุดไทย + work schedule + วันลาที่รู้แล้ว | เห็น overload ที่ Excel มองไม่เห็นมาก่อน |
| 3 | Planner 1–2 คนใช้คู่ขนานกับ Excel 2 สัปดาห์ | ไม่มี blocker |
| 4 | เปิดให้ Member เข้ามาแจ้งลาเอง | ข้อมูลลาครบโดยไม่ต้อง Planner คีย์ |
| 5 | ประกาศให้เว็บเป็น source of truth | ทีมเข้าใจตรงกัน |
| 6 | เลิกอัปเดต Excel, export ให้คนนอกระบบแทน | — |
| 7 | (ถ้าใช้ Asana อยู่) import โครงงานเข้ามา แล้วปิด Asana | task ครบ ไม่มีใครกลับไปเปิด Asana อีก 2 สัปดาห์ |

**ลำดับที่แนะนำ:** ย้ายจาก Excel ก่อน ย้ายจาก Asana ทีหลัง — เพราะกริดกำลังคน (สิ่งที่ Excel ทำ) คือคุณค่าหลักที่ทำให้คนยอมเปลี่ยน ส่วนลิสต์งาน (สิ่งที่ Asana ทำ) เป็นของที่ต้องมีแต่ไม่ใช่เหตุผลที่คนย้าย

**Rollback:** export xlsx ได้ตลอดเวลา — เป็นเหตุผลว่าทำไม export ต้องอยู่ใน MVP

---

## 14. Open questions

คำถามที่ปิดไปแล้วจาก v1.0:

| คำถาม | คำตอบ |
|---|---|
| Plan มีขอบหรือต่อเนื่อง | ✅ **ต่อเนื่องไม่มีขอบ** |
| Assignment = project หรือ task ย่อย | ✅ **task ย่อย ซ้อนชั้นได้ 3 ชั้น** |
| ต้องมี actual vs plan ไหม | ✅ **ไม่ต้อง** — วางแผนอย่างเดียว |
| วันลาอยู่เฟสไหน | ✅ **MVP** |
| ต้องมี approval workflow ของแผนไหม | ✅ **ไม่มี** — ใครมีสิทธิ์แก้ได้ทันที, audit log คือกลไกความรับผิดชอบ §1.4 |
| Task ที่ไม่มีคนรับ นับภาระไหม | ✅ **แสดงเป็นแถว "รอมอบหมาย" ไม่ซ่อน แต่ไม่นับเข้า overload ของใคร** (FR-119) |
| ระบบนี้อยู่เหนือ Asana หรือแทน Asana | ✅ **แทน** — เป็นเครื่องมือวางแผนหลักของทีม §1.4 |

ที่ยังค้าง:

1. **คนหนึ่งอยู่หลายทีม จะแบ่ง capacity ยังไง?** — ตอนนี้ capacity เป็นของคน ไม่ใช่ของทีม ถ้าต้องการโควตาต่อทีม ("Cindy ให้ทีม A ได้ 60%") ต้องเพิ่ม `team_allocations` และ overload จะมี 2 ระดับ
   *ข้อควรระวัง:* feature นี้เพิ่ม concept ที่ 8 — ขัดกับ §1.5 ข้อ 1 ควรเลี่ยงถ้าไม่จำเป็นจริง
2. **ย้อนหลังแก้ได้แค่ไหน?** — ควร lock สัปดาห์ที่ผ่านไปแล้วไหม หรือแก้ได้ตลอด
   *ข้อเสนอ:* แก้ได้ตลอด (ไม่มี actual จึงไม่มีอะไรให้ปกป้อง) แต่สัปดาห์ที่ผ่านมาแล้วแสดงสีจางลงเพื่อบอกว่าไม่ใช่โฟกัส
3. **ปี พ.ศ. หรือ ค.ศ. เป็น default?** — เสนอ ค.ศ. ในข้อมูล, พ.ศ. เป็น toggle ที่ระดับ org
4. **ต้องมี "งานส่วนตัว" ที่ไม่ผูกโปรเจคไหม?** — เช่น ประชุมประจำสัปดาห์ งาน admin ที่กินเวลาจริงแต่ไม่ใช่โปรเจคลูกค้า
   *ข้อเสนอ:* ใช้ project ชื่อ "Internal" แทนการเพิ่ม concept ใหม่ (ซึ่ง Excel เดิมก็ทำแบบนี้อยู่แล้ว)

---

## ภาคผนวก A — Mapping จาก Excel มาเว็บ

| ชีต Excel | หน้าเว็บ | หมายเหตุ |
|---|---|---|
| `Setup` | `/settings/people`, `/settings/*` | certainty ย้ายไปหน้า projects |
| `Plan` | `/` (Planner) | 1 แถว → task + assignment; เพิ่มชั้น section และ task ลูก |
| `Timeline รายคน` | `/timeline` | บล็อกต่อคน → collapsible |
| `Workload รายคน` | `/workload` | 3 บล็อก → segmented control |
| `สรุปรายโปรเจค` | `/projects` | |
| `แจ้งเตือน Overload` | `/alerts` | เพิ่มคอลัมน์ "สาเหตุ" |
| *(ไม่มีใน Excel)* | `/calendar` | ปฏิทินวันลา — ของใหม่ |
| *(ไม่มีใน Excel)* | `/me` | หน้าของสมาชิกทีม — ของใหม่ |
| *(ไม่มีใน Excel)* | `/list` | มุมมองลิสต์แบบ Asana — ของใหม่ |
| *(ไม่มีใน Excel)* | `/board` | มุมมองบอร์ด — ของใหม่ (Phase 2) |

## ภาคผนวก B — สูตร Excel → โค้ด

| สูตร Excel | เทียบเท่าในเว็บ |
|---|---|
| `SUMIFS(Plan!F:F, Plan!D:D, person)` | `load(person, week, 'total')` |
| `SUMIFS(..., Plan!AA:AA, "แน่นอน")` | `load(person, week, 'committed')` |
| `IF(E6<>"", E6, INDEX(Setup!G:G, MATCH(...)))` | `effectiveCertainty(task, ancestors, project)` |
| `1.00` (capacity คงที่) | `weekCapacity(person, week)` — §5.6 |
| `IF(committed>1,"OVER",IF(total>1,"เสี่ยง",""))` | `overloadStatus(person, week)` |
| `COUNTIF(B8:S8,"OVER*")` | `alerts.filter(a => a.level === 'OVER').length` |
| `SUM(B15:S15)/COUNT(people)` | `utilization(range, scenario)` |
| conditional formatting 3 สี | `loadColorBand(load, capacity)` |
| *(ไม่มี)* | `dayCapacity`, `derivedDayLoad`, `diagnoseCause` — ของใหม่ทั้งหมด |
