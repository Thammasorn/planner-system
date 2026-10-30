export const th = {
  common: { undo: 'เลิกทำ', save: 'บันทึก', today: 'วันนี้' },
  grid: { saveFailed: 'บันทึกไม่สำเร็จ · ลองใหม่', conflict: 'มีคนแก้แผนนี้พร้อมกัน — โหลดค่าล่าสุดแล้ว' },
  palette: { placeholder: 'ค้นหา…', empty: 'ไม่พบผลลัพธ์', loading: 'กำลังค้นหา…' },
  task: { deleted: (name: string, n: number) => `ลบ '${name}' และงานย่อย ${n} งานแล้ว` },
} as const
