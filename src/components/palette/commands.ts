'use client'
// src/components/palette/commands.ts — quick commands of the command palette (plan/m08 S4.10, FR-702, X08, X88,
// M8-D18). Rendered as the group "คำสั่ง" before the M4/M6.1 search groups (PALETTE_GROUPS stays untouched);
// filtered client-side on the query and shown on an empty query. M10 appends สร้าง task / สร้างหน้า / แจ้งลา /
// ไปหน้าวันนี้ here (M10-D23) and adds its ctx fields in useCommandCtx() (PaletteProvider.tsx).
import { useMilestoneTargets } from '@/components/milestones/useProjectMilestones'
import { th } from '@/i18n/th'
import { useSearchIndex } from './useSearchIndex'

/** Open for additive fields (C48): M10 adds navigate, openLeaveDialog, beginCreateTask, createPageHere. Built only by useCommandCtx(). */
export interface PaletteCommandCtx {
  close(): void
  pathname: string
  currentProjectId: string | null
  openMilestoneDialog(o: { projectId?: string }): void
  /** M10: router.push(href). */
  navigate(href: string): void
  /** M10: the one leave dialog in create mode (M5-D14). */
  openLeaveDialog(): void
  /** M10: the palette's "สร้าง task" steps (current project → name, else the project picker). */
  beginCreateTask(): void
  /** M10: a blank page in the current project (or the team wiki), then open it. */
  createPageHere(): Promise<void>
}

export interface PaletteCommand {
  id: string
  label: string
  keywords: string
  /** A hook: called on every render of the commands group, in PALETTE_COMMANDS order. */
  useVisible(): boolean
  run(ctx: PaletteCommandCtx): void
}

export const PALETTE_COMMANDS: readonly PaletteCommand[] = [
  {
    id: 'milestone.create',
    label: th.milestones.palette.create,
    keywords: th.milestones.palette.keywords,
    // M/L only: GET /api/milestones/targets is empty for everyone else (M8-D18)
    useVisible: () => (useMilestoneTargets(true).data?.projects.length ?? 0) > 0,
    run: (ctx) => {
      ctx.close()
      ctx.openMilestoneDialog(ctx.currentProjectId !== null ? { projectId: ctx.currentProjectId } : {})
    },
  },
  // M10 (FR-1103, X68, M10-D23): the four quick commands, appended after M8's
  {
    id: 'task.create',
    label: th.palette.commands.createTask.label,
    keywords: th.palette.commands.createTask.keywords,
    // hidden only when the index says there is no non-archived project (unknown yet → shown)
    useVisible: () => {
      const projects = useSearchIndex().data?.projects
      return Array.isArray(projects) ? projects.some((p) => !p.archived) : true
    },
    run: (ctx) => ctx.beginCreateTask(),
  },
  {
    id: 'page.create',
    label: th.palette.commands.createPage.label,
    keywords: th.palette.commands.createPage.keywords,
    useVisible: () => true,
    run: (ctx) => void ctx.createPageHere(),
  },
  {
    id: 'leave.report',
    label: th.palette.commands.reportLeave.label,
    keywords: th.palette.commands.reportLeave.keywords,
    useVisible: () => true,
    run: (ctx) => {
      ctx.close()
      ctx.openLeaveDialog()
    },
  },
  {
    id: 'nav.today',
    label: th.palette.commands.goToday.label,
    keywords: th.palette.commands.goToday.keywords,
    useVisible: () => true,
    run: (ctx) => {
      ctx.close()
      ctx.navigate('/home')
    },
  },
]

/** '' → true; case-insensitive substring of the label or the keywords. */
export function matchCommand(c: Pick<PaletteCommand, 'label' | 'keywords'>, q: string): boolean {
  const needle = q.trim().toLocaleLowerCase('th')
  if (needle === '') return true
  return (
    c.label.toLocaleLowerCase('th').includes(needle) || c.keywords.toLocaleLowerCase('th').includes(needle)
  )
}

/** Calls every command's useVisible() in array order (PALETTE_COMMANDS is a module constant → stable hook order), then filters by visibility and matchCommand. */
export function useVisibleCommands(q: string): PaletteCommand[] {
  const visible: PaletteCommand[] = []
  for (const c of PALETTE_COMMANDS) {
    // a hook call in a loop: PALETTE_COMMANDS is a module-level constant, so the hook order never changes
    if (c.useVisible()) visible.push(c)
  }
  return visible.filter((c) => matchCommand(c, q))
}

const PROJECT_PATH = /^\/projects\/([0-9a-f-]{36})(?:\/|$)/

/** `/projects/<uuid>/…` → the uuid; M10 uses it as its scope fallback. */
export function projectIdFromPath(pathname: string): string | null {
  return PROJECT_PATH.exec(pathname)?.[1] ?? null
}
