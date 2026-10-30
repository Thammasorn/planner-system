# docs/ — บริบทประกอบสำหรับ Claude Code

เอกสารในโฟลเดอร์นี้เป็น **บริบทเสริม** ของ `../SPEC.md` — ใช้เมื่อต้องการเข้าใจ "ทำไม" หรือต้องการข้อมูลดิบ

## ลำดับความสำคัญเมื่อข้อมูลขัดกัน

1. **`../SPEC.md`** — แหล่งความจริงเดียว ชนะทุกอย่าง
2. `../CLAUDE.md` — กฎการทำงานและข้อห้าม
3. `reference/golden-fixtures.json` — ข้อมูล seed และผลลัพธ์ที่คาดหวัง (สร้างจาก Excel อัตโนมัติ)
4. `history/decisions-log.md` — ที่มาของแต่ละ requirement ตามลำดับที่เจ้าของผลิตภัณฑ์ขอ
5. `reference/*.md`, `reference/*.xlsx` — ระบบเดิมที่ทีมใช้อยู่
6. `history/design-spec-v2.1.md` — เอกสารออกแบบฉบับก่อน **ถูกแทนที่แล้ว** อ่านเพื่อเข้าใจเหตุผลเท่านั้น

## ไฟล์

| ไฟล์ | คืออะไร | ใช้เมื่อไหร่ |
|---|---|---|
| `reference/golden-fixtures.json` | พนักงาน, ลูกค้า, โปรเจค, task, แผน (หน่วย cd) + ผลที่คาดหวังของ fixture F1–F4 | เขียน `scripts/seed-golden.ts` และ test ใน M6, M9 |
| `reference/excel-workload-planner.md` | โครงสร้างและสูตรของ Excel วางแผนกำลังคนที่ทีมใช้อยู่ → map ไปเป็น domain rule | อยากรู้ที่มาของ BR ต่าง ๆ, การ import Excel (Phase 2) |
| `reference/excel-project-plan-cost.md` | โครงสร้าง Excel แผนงาน+ต้นทุนรายโปรเจค (rate card) | **อ้างอิงเท่านั้น — ไม่อยู่ใน MVP** |
| `reference/Workload_Planner_Aug-Dec_2026.xlsx` | Excel ต้นฉบับ (ก่อนเพิ่มความแน่นอน) | ไม่ต้องใช้ในการพัฒนา |
| `reference/Workload_Planner_Aug-Dec_2026_v2.xlsx` | Excel ฉบับที่มีความแน่นอน + 2 ฉาก — ต้นทางของ golden fixture | ตรวจตัวเลขย้อนกลับ |
| `reference/Project_Plan_Cost_Template.xlsx` | Excel แผนงาน+ต้นทุน | อ้างอิงเท่านั้น |
| `history/decisions-log.md` | ลำดับคำขอและการตัดสินใจทั้งหมด | spec ไม่ชัดแล้วอยากรู้เจตนา |
| `history/design-spec-v2.1.md` | เอกสารออกแบบฉบับก่อน | อยากรู้เหตุผลเชิงลึก (เช่นทำไมใช้ person-day) |

## ข้อห้าม

- **ห้าม** อ่านไฟล์ `.xlsx` ตอน runtime ของแอป — ใช้ `golden-fixtures.json` แทน
- **ห้าม** implement ฟีเจอร์ต้นทุน/rate card จาก `Project_Plan_Cost_Template.xlsx` จนกว่า SPEC จะถูกแก้ให้รวมไว้
- **ห้าม** ยึด `design-spec-v2.1.md` เมื่อขัดกับ SPEC.md (เช่น v2.1 บอกว่าไม่มี milestone, มี section, มี approval ของวันลาใน Phase 2 — SPEC.md ปัจจุบันเปลี่ยนแล้วทั้งหมด)
