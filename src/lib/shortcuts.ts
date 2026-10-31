// src/lib/shortcuts.ts — the data-driven `?` shortcut-help registry (X07, SPEC §8.6). Static; later milestones append
// scopes and entries (M4 'palette'/'editor' + Cmd+K, M6 'grid'). Matching itself lives in useHotkeys (e.code, X49).
import { th } from '@/i18n/th'

export type ShortcutScope = 'global' | 'taskList'
export type KeyToken =
  | 'Mod'
  | 'Shift'
  | 'Alt'
  | 'ArrowUp'
  | 'ArrowDown'
  | 'F10'
  | 'Enter'
  | 'Tab'
  | 'Esc'
  | 'Space'
  | 'Delete'
  | 'Click'
  | 'Backslash'
  | 'Z'
  | 'N'
  | 'S'
  | 'K'
  | '?'

export interface ShortcutDef {
  id: string
  scope: ShortcutScope
  /** Alternative key combinations; each is shown as tokens joined with "+". */
  combos: readonly (readonly KeyToken[])[]
  label: string
}

export const SHORTCUT_SCOPES: readonly ShortcutScope[] = ['global', 'taskList']

export const SHORTCUTS: readonly ShortcutDef[] = [
  {
    id: 'sidebar.toggle',
    scope: 'global',
    combos: [['Mod', 'Backslash']],
    label: th.shortcuts.items.toggleSidebar,
  },
  { id: 'close', scope: 'global', combos: [['Esc']], label: th.shortcuts.items.close },
  { id: 'undo', scope: 'global', combos: [['Mod', 'Z']], label: th.shortcuts.items.undo },
  { id: 'redo', scope: 'global', combos: [['Mod', 'Shift', 'Z']], label: th.shortcuts.items.redo },
  { id: 'task.new', scope: 'global', combos: [['N']], label: th.shortcuts.items.newTask },
  { id: 'help', scope: 'global', combos: [['?']], label: th.shortcuts.items.help },
  { id: 'palette.open', scope: 'global', combos: [['Mod', 'K']], label: th.shortcuts.items.palette },
  { id: 'list.next', scope: 'taskList', combos: [['Enter']], label: th.shortcuts.items.listNext },
  { id: 'list.indent', scope: 'taskList', combos: [['Tab']], label: th.shortcuts.items.listIndent },
  {
    id: 'list.outdent',
    scope: 'taskList',
    combos: [['Shift', 'Tab']],
    label: th.shortcuts.items.listOutdent,
  },
  {
    id: 'list.complete',
    scope: 'taskList',
    combos: [['Mod', 'Enter']],
    label: th.shortcuts.items.listComplete,
  },
  { id: 'list.delete', scope: 'taskList', combos: [['Delete']], label: th.shortcuts.items.listDelete },
  { id: 'list.open', scope: 'taskList', combos: [['Space']], label: th.shortcuts.items.listOpen },
  {
    id: 'list.multi',
    scope: 'taskList',
    combos: [
      ['Shift', 'Click'],
      ['Mod', 'Click'],
    ],
    label: th.shortcuts.items.listMultiSelect,
  },
  // v3.1 FR-626 (rows and board cards)
  { id: 'list.status', scope: 'taskList', combos: [['S']], label: th.shortcuts.items.listStatus },
  // M3-D10 keyboard alternatives to drag: reorder among siblings and the row menu (ย้ายขึ้น / ย้ายลง …)
  {
    id: 'list.move',
    scope: 'taskList',
    combos: [
      ['Alt', 'ArrowUp'],
      ['Alt', 'ArrowDown'],
    ],
    label: th.shortcuts.items.listMove,
  },
  { id: 'list.menu', scope: 'taskList', combos: [['Shift', 'F10']], label: th.shortcuts.items.listMenu },
]
