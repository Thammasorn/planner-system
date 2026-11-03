'use client'
// src/components/editor/slash-menu.tsx — Thai slash menu (FR-506/520/528, AC-501/504, M4-D14, r3 §5.2).
// From plan/research/snippets/r3/harness/src/slashMenu.tsx: BlockNote's default items (titles come from the Thai
// dictionary, English aliases stay searchable), `/ตาราง` → 3×3, custom `/หน้า` (create a child page, insert its
// card) when allowed (never in a TASK body, M6.1-D9), ranked filter, word-start guard, stable getItems (r3 G23).
// M11 (FR-1403/1404, FR-1501/1502, M11-D10/D29/D38): the "ฐานข้อมูล" group (ตารางข้อมูล · คัมบัง · ปฏิทิน) in DOC and
// TASK bodies, and in row bodies below the nesting limit (nested databases, FR-1475 rev. 2026-11-03) — and the two
// equation items (group "ขั้นสูง") everywhere.
import { insertOrUpdateBlockForSlashMenu } from '@blocknote/core'
import CalendarMonthOutlined from '@mui/icons-material/CalendarMonthOutlined'
import Functions from '@mui/icons-material/Functions'
import GroupsOutlined from '@mui/icons-material/GroupsOutlined'
import TableChartOutlined from '@mui/icons-material/TableChartOutlined'
import ViewColumnOutlined from '@mui/icons-material/ViewColumnOutlined'
import ViewKanbanOutlined from '@mui/icons-material/ViewKanbanOutlined'
import {
  type DefaultReactSuggestionItem,
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
} from '@blocknote/react'
import { type JSX, useCallback } from 'react'
import { th } from '@/i18n/th'
import type { DbViewType } from '@/lib/contracts/databases'
import type { PageKind, PageSpace } from '@/lib/contracts/pages'
import { markDatabaseJustCreated, setDatabaseBlockPhase } from '@/lib/editor/database-block-state'
import { requestBlockEquationOpen, requestInlineEquationOpen } from './math/open-request'
import { rankSuggestionItems, slashShouldOpen } from '@/lib/editor/suggest'
import type { AppEditor } from './schema'

export interface SlashCtx {
  /** Creates the child page (server action) and resolves its id, or null after a failure (already toasted). */
  createSubpage: () => Promise<string | null>
  /** canEdit && depth < 9 (FR-502: at most 10 levels). */
  canCreateSubpage: boolean
  /** M6.1-D9 (FR-680): a TASK body has no page tree → never the sub-page item. Default 'DOC'. */
  kind?: PageKind
  /** M10-D5: the live blocks are offered on PROJECT pages only. Default 'WORKSPACE'. */
  space?: PageSpace
  /** M10-D5: the viewer may edit the page (the live items are offered only then). Default false. */
  canEdit?: boolean
  /**
   * M11 (FR-1404, M11-D10): creates the database of a just inserted block (ensures a task body's row first, seeds
   * qk.database) and resolves its id, or null after a failure (already toasted). Absent → no database items.
   */
  createDatabase?: (view: DbViewType) => Promise<string | null>
}

const EMPTY_ROW = (): { cells: string[] } => ({ cells: ['', '', ''] })

function subpageItem(editor: AppEditor, ctx: SlashCtx): DefaultReactSuggestionItem {
  const s = th.editor.slash.subpage
  return {
    title: s.title,
    subtext: s.subtext,
    aliases: [...s.aliases],
    group: s.group,
    icon: <span aria-hidden>📄</span>,
    onItemClick: () => {
      // Placeholder card first ("กำลังสร้างหน้า…") so the cursor stays put during the async call (M4-D14).
      const block = insertOrUpdateBlockForSlashMenu(editor, { type: 'subpage', props: { pageId: '' } })
      void ctx
        .createSubpage()
        .catch(() => null)
        .then((id) => {
          if (!editor.getBlock(block.id)) return
          if (id) editor.updateBlock(block.id, { props: { pageId: id } })
          else editor.removeBlocks([block.id])
        })
    },
  }
}

/** M10 (FR-1301/1303, M10-D5): "มุมมองงาน" and "ภาระทีม" — PROJECT documents the viewer may edit. */
function liveItems(editor: AppEditor, ctx: SlashCtx): DefaultReactSuggestionItem[] {
  if (ctx.space !== 'PROJECT' || ctx.canEdit !== true || (ctx.kind ?? 'DOC') !== 'DOC') return []
  const s = th.editor.slash
  return [
    {
      title: s.taskView.title,
      subtext: s.taskView.subtext,
      aliases: [...s.taskView.aliases],
      group: s.taskView.group,
      icon: <ViewKanbanOutlined fontSize="small" />,
      onItemClick: () => {
        insertOrUpdateBlockForSlashMenu(editor, { type: 'taskView', props: { view: 'BOARD' } })
      },
    },
    {
      title: s.projectWorkload.title,
      subtext: s.projectWorkload.subtext,
      aliases: [...s.projectWorkload.aliases],
      group: s.projectWorkload.group,
      icon: <GroupsOutlined fontSize="small" />,
      onItemClick: () => {
        insertOrUpdateBlockForSlashMenu(editor, { type: 'projectWorkload' })
      },
    },
  ]
}

const DATABASE_ITEMS = [
  { view: 'TABLE', key: 'databaseTable', icon: <TableChartOutlined fontSize="small" /> },
  { view: 'KANBAN', key: 'databaseKanban', icon: <ViewColumnOutlined fontSize="small" /> },
  { view: 'CALENDAR', key: 'databaseCalendar', icon: <CalendarMonthOutlined fontSize="small" /> },
] as const

/** M11 (FR-1403/1404): the "ฐานข้อมูล" group — whenever creation is wired: DOC and TASK bodies, and row bodies below
 *  the nesting limit (PageEditor wires `createDatabase` there only then, FR-1475 rev. 2026-11-03). */
function databaseItems(editor: AppEditor, ctx: SlashCtx): DefaultReactSuggestionItem[] {
  const create = ctx.createDatabase
  if (!create) return []
  return DATABASE_ITEMS.map(({ view, key, icon }) => {
    const s = th.editor.slash[key]
    return {
      title: s.title,
      subtext: s.subtext,
      aliases: [...s.aliases],
      group: s.group,
      icon,
      onItemClick: () => {
        // placeholder block first ("กำลังสร้างฐานข้อมูล…"), the caret stays put during the async call (as /หน้า)
        const block = insertOrUpdateBlockForSlashMenu(editor, { type: 'database', props: { databaseId: '' } })
        setDatabaseBlockPhase(block.id, 'creating')
        void create(view)
          .catch(() => null)
          .then((id) => {
            setDatabaseBlockPhase(block.id, null)
            if (!editor.getBlock(block.id)) return
            if (id) {
              markDatabaseJustCreated(block.id) // the view focuses its title once (FR-1404)
              editor.updateBlock(block.id, { props: { databaseId: id } })
            } else editor.removeBlocks([block.id])
          })
      },
    }
  })
}

/** M11 (FR-1501/1502, M11-D29): block and inline equation — every page kind. */
function equationItems(editor: AppEditor): DefaultReactSuggestionItem[] {
  const s = th.editor.slash
  return [
    {
      title: s.equation.title,
      subtext: s.equation.subtext,
      aliases: [...s.equation.aliases],
      group: s.equation.group,
      icon: <Functions fontSize="small" />,
      onItemClick: () => {
        const block = insertOrUpdateBlockForSlashMenu(editor, { type: 'equation', props: { latex: '' } })
        requestBlockEquationOpen(block.id) // the empty block opens its LaTeX field (FR-1501)
      },
    },
    {
      title: s.inlineEquation.title,
      subtext: s.inlineEquation.subtext,
      aliases: [...s.inlineEquation.aliases],
      group: s.inlineEquation.group,
      icon: <Functions fontSize="small" />,
      onItemClick: () => {
        requestInlineEquationOpen()
        editor.insertInlineContent([{ type: 'inlineEquation', props: { latex: '' } }])
      },
    },
  ]
}

export function getSlashMenuItems(editor: AppEditor, ctx: SlashCtx): DefaultReactSuggestionItem[] {
  const out: DefaultReactSuggestionItem[] = []
  for (const item of getDefaultReactSlashMenuItems(editor)) {
    // The runtime items still carry `key` although the React type omits it (r3 §5.2).
    if ('key' in item && item.key === 'table') {
      out.push({
        ...item,
        onItemClick: () => {
          insertOrUpdateBlockForSlashMenu(editor, {
            type: 'table',
            content: { type: 'tableContent', rows: [EMPTY_ROW(), EMPTY_ROW(), EMPTY_ROW()] },
          })
        },
      })
      // Right after the table so the "ขั้นสูง" group stays contiguous.
      if (ctx.canCreateSubpage && (ctx.kind ?? 'DOC') === 'DOC') out.push(subpageItem(editor, ctx))
      out.push(...equationItems(editor)) // M11: still "ขั้นสูง"
      out.push(...liveItems(editor, ctx)) // M10-D5: right after หน้า (their own "ข้อมูลสด" group)
      out.push(...databaseItems(editor, ctx)) // M11: their own "ฐานข้อมูล" group
      continue
    }
    out.push(item)
  }
  return out
}

export function SlashMenu({ editor, ctx }: { editor: AppEditor; ctx: SlashCtx }): JSX.Element {
  const getItems = useCallback(
    (query: string): Promise<DefaultReactSuggestionItem[]> => {
      try {
        return Promise.resolve(rankSuggestionItems(getSlashMenuItems(editor, ctx), query))
      } catch {
        return Promise.resolve([]) // a rejection would leave the menu loading (r3 §5)
      }
    },
    [editor, ctx],
  )
  return <SuggestionMenuController triggerCharacter="/" shouldOpen={slashShouldOpen} getItems={getItems} />
}
