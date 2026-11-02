// src/lib/shortcuts.ts — the data-driven `?` shortcut-help registry (X07, SPEC §8.6). Static; later milestones append
// scopes and entries (M4 'palette'/'editor' + Cmd+K, M5 'calendar', M6 'grid'). Matching itself lives in useHotkeys /
// the widgets' own key handlers (e.code, X49).
import { th } from '@/i18n/th'

export type ShortcutScope = 'global' | 'taskList' | 'taskPage' | 'calendar' | 'grid' | 'palette'
export type KeyToken =
  | 'Mod'
  | 'Shift'
  | 'Alt'
  | 'ArrowUp'
  | 'ArrowDown'
  | 'ArrowLeft'
  | 'ArrowRight'
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
  | 'F'
  | 'H'
  | 'C'
  | 'V'
  | 'Arrows'
  | 'Backspace'
  | 'Drag'

export interface ShortcutDef {
  id: string
  scope: ShortcutScope
  /** Alternative key combinations; each is shown as tokens joined with "+". */
  combos: readonly (readonly KeyToken[])[]
  label: string
}

export const SHORTCUT_SCOPES: readonly ShortcutScope[] = [
  'global',
  'taskList',
  'taskPage',
  'calendar',
  'grid',
  'palette', // M10 (KEY-06)
]

/** Section heading of each scope in the `?` help (M5: the calendar heading lives in its own namespace). */
export const SHORTCUT_SCOPE_LABELS: Readonly<Record<ShortcutScope, string>> = {
  global: th.shortcuts.scopes.global,
  taskList: th.shortcuts.scopes.taskList,
  taskPage: th.shortcuts.scopes.taskPage,
  calendar: th.calendar.shortcuts.scope,
  grid: th.shortcuts.scopes.grid,
  palette: th.shortcuts.scopes.palette,
}

/** Key caption of every token ('Mod' = Ctrl here; the help shows ⌘ on Apple platforms). */
export const SHORTCUT_KEY_LABELS: Readonly<Record<KeyToken, string>> = th.shortcuts.keys

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
  // M6.1 (FR-685): Shift+Space opens the task page (matched on e.code === 'Space' + shiftKey, X49)
  {
    id: 'list.openPage',
    scope: 'taskList',
    combos: [['Shift', 'Space']],
    label: th.shortcuts.items.listOpenPage,
  },
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
  // M6.1 task page /t/[taskId] (FR-683, FR-686): Esc outside inputs/editor/menus = back; Enter in the title = body
  { id: 'taskPage.back', scope: 'taskPage', combos: [['Esc']], label: th.shortcuts.items.taskPageBack },
  {
    id: 'taskPage.titleEnter',
    scope: 'taskPage',
    combos: [['Enter']],
    label: th.shortcuts.items.taskPageTitleEnter,
  },
  // M5 calendar month grid (FR-908, X49/X58): roving focus, Shift extends the range, Enter/Space opens the leave dialog
  {
    id: 'calendar.move',
    scope: 'calendar',
    combos: [['ArrowLeft'], ['ArrowRight'], ['ArrowUp'], ['ArrowDown']],
    label: th.calendar.shortcuts.moveDay,
  },
  {
    id: 'calendar.extend',
    scope: 'calendar',
    combos: [
      ['Shift', 'ArrowLeft'],
      ['Shift', 'ArrowRight'],
      ['Shift', 'ArrowUp'],
      ['Shift', 'ArrowDown'],
    ],
    label: th.calendar.shortcuts.extend,
  },
  {
    id: 'calendar.open',
    scope: 'calendar',
    combos: [['Enter'], ['Space']],
    label: th.calendar.shortcuts.open,
  },
  { id: 'calendar.clear', scope: 'calendar', combos: [['Esc']], label: th.calendar.shortcuts.clear },
  // M6 planning grid (§4.8, §8.6, X07, X49 — matched on e.code by useGridKeyboard); M7 appends the day entries.
  { id: 'grid.edit', scope: 'grid', combos: [['Enter'], ['Tab']], label: th.shortcuts.items.gridEdit },
  { id: 'grid.cancel', scope: 'grid', combos: [['Esc']], label: th.shortcuts.items.gridCancel },
  {
    id: 'grid.select',
    scope: 'grid',
    combos: [['Shift', 'Arrows'], ['Drag']],
    label: th.shortcuts.items.gridSelect,
  },
  { id: 'grid.full', scope: 'grid', combos: [['F']], label: th.shortcuts.items.gridFull },
  { id: 'grid.half', scope: 'grid', combos: [['H']], label: th.shortcuts.items.gridHalf },
  { id: 'grid.copy', scope: 'grid', combos: [['Mod', 'C']], label: th.shortcuts.items.gridCopy },
  { id: 'grid.paste', scope: 'grid', combos: [['Mod', 'V']], label: th.shortcuts.items.gridPaste },
  {
    id: 'grid.shift',
    scope: 'grid',
    combos: [
      ['Mod', 'ArrowLeft'],
      ['Mod', 'ArrowRight'],
    ],
    label: th.shortcuts.items.gridShift,
  },
  {
    id: 'grid.clear',
    scope: 'grid',
    combos: [['Delete'], ['Backspace']],
    label: th.shortcuts.items.gridClear,
  },
  // Shift+Space selects the focused row — the keyboard path to deleting a task row (M6-D19)
  {
    id: 'grid.selectRow',
    scope: 'grid',
    combos: [['Shift', 'Space']],
    label: th.shortcuts.items.gridSelectRow,
  },
  { id: 'grid.newTask', scope: 'grid', combos: [['N']], label: th.shortcuts.items.gridNewTask },
  // M7 day resolution (FR-803, M7-D11, M7-D23; X49 — e.code ArrowDown/ArrowUp with metaKey || ctrlKey)
  {
    id: 'grid.expandWeek',
    scope: 'grid',
    combos: [['Mod', 'ArrowDown']],
    label: th.shortcuts.items.gridExpandWeek,
  },
  {
    id: 'grid.collapseWeek',
    scope: 'grid',
    combos: [['Mod', 'ArrowUp']],
    label: th.shortcuts.items.gridCollapseWeek,
  },
  { id: 'grid.cellMenu', scope: 'grid', combos: [['Shift', 'F10']], label: th.shortcuts.items.gridCellMenu },
  // M7.1 (FR-815, M7.1-D17, X49 — e.code Arrow* with altKey, without metaKey/ctrlKey; FR-819 Shift+F10 on a header)
  {
    id: 'grid.moveRow',
    scope: 'grid',
    combos: [
      ['Alt', 'ArrowUp'],
      ['Alt', 'ArrowDown'],
    ],
    label: th.shortcuts.items.gridMoveRow,
  },
  {
    id: 'grid.indentRow',
    scope: 'grid',
    combos: [
      ['Alt', 'ArrowRight'],
      ['Alt', 'ArrowLeft'],
    ],
    label: th.shortcuts.items.gridIndentRow,
  },
  {
    id: 'grid.addMarker',
    scope: 'grid',
    combos: [['Shift', 'F10']],
    label: th.shortcuts.items.gridAddMarker,
  },
  // M8 (FR-707, M8-D10, X49): Enter on a focused ◆ opens its popover (date field = keyboard move). Shift+F10 on ◆ is
  // M7's grid.cellMenu entry (same CellMenu, other items) — no second entry.
  { id: 'grid.milestoneOpen', scope: 'grid', combos: [['Enter']], label: th.shortcuts.items.gridMilestoneOpen },
  // M10 palette scope (KEY-06, X07): moving in results, opening the selected hit/command, Backspace on an empty
  // input leaves a command step. 'palette.open' (Cmd+K) is M4's global entry, so Enter is 'palette.select'.
  {
    id: 'palette.move',
    scope: 'palette',
    combos: [['ArrowUp'], ['ArrowDown']],
    label: th.shortcuts.items.paletteMove,
  },
  { id: 'palette.select', scope: 'palette', combos: [['Enter']], label: th.shortcuts.items.paletteOpen },
  { id: 'palette.back', scope: 'palette', combos: [['Backspace']], label: th.shortcuts.items.paletteBack },
]
