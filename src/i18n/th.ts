/**
 * All UI text (CLAUDE.md › UX, SPEC §8.8, PLAN.md §3.7). Namespaces are created by the milestone that needs
 * them; parameterised strings are functions. Tests and e2e import `th` instead of copying Thai literals.
 */
export const th = {
  meta: {
    appName: 'Team Working OS',
    titleTemplate: '%s · Team Working OS',
    description: 'ระบบวางแผนงานและเอกสารของทีม',
  },
  common: {
    loading: 'กำลังโหลด…',
    retry: 'ลองอีกครั้ง',
    backToHome: 'กลับหน้าหลัก',
    notifications: 'การแจ้งเตือน',
    close: 'ปิด',
  },
  nav: {
    sidebarLabel: 'เมนูหลัก',
    home: 'หน้าหลัก',
    collapseSidebar: 'ย่อแถบด้านข้าง',
    expandSidebar: 'ขยายแถบด้านข้าง',
    toggleHint: (action: string) => `${action} (⌘ \\ หรือ Ctrl + \\)`,
    openMenu: 'เปิดเมนู',
    skipToContent: 'ข้ามไปยังเนื้อหา',
  },
  errors: {
    notFoundPage: {
      title: 'ไม่พบหน้าที่ต้องการ',
      body: 'หน้านี้อาจถูกลบ ย้ายที่ หรือคุณไม่มีสิทธิ์เข้าถึง',
    },
    errorPage: {
      title: 'เกิดข้อผิดพลาด',
      body: 'ระบบขัดข้องชั่วคราว ลองอีกครั้ง หากยังไม่หายให้แจ้งผู้ดูแลระบบ',
    },
  },
  home: {
    title: 'หน้าหลัก',
    greeting: 'สวัสดี',
    today: (date: string) => `วันนี้ ${date}`,
    placeholderTitle: 'กำลังเตรียมพื้นที่ทำงานของทีม',
    placeholderBody: 'เมนูต่าง ๆ จะปรากฏในแถบด้านข้างเมื่อแต่ละส่วนพร้อมใช้งาน',
  },
} as const

export type Th = typeof th
