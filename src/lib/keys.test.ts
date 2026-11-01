// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { HOTKEYS, isEditableTarget, isRedoKey, isUndoKey, matchesHotkey, type HotkeyEvent } from './keys'

function ev(p: Partial<HotkeyEvent> & Pick<HotkeyEvent, 'code' | 'key'>): HotkeyEvent {
  return { metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...p }
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('matchesHotkey', () => {
  const hk = HOTKEYS.toggleSidebar
  it.each([
    ['Ctrl+\\', ev({ code: 'Backslash', key: '\\', ctrlKey: true }), true],
    ['Cmd+\\ on the Thai Kedmanee layout', ev({ code: 'Backslash', key: 'ฃ', metaKey: true }), true],
    ['no modifier', ev({ code: 'Backslash', key: '\\' }), false],
    ['Ctrl+Shift+\\', ev({ code: 'Backslash', key: '|', ctrlKey: true, shiftKey: true }), false],
    ['Ctrl+Alt+\\', ev({ code: 'Backslash', key: '\\', ctrlKey: true, altKey: true }), false],
    ['key fallback (IntlYen)', ev({ code: 'IntlYen', key: '\\', ctrlKey: true }), true],
    ['other key', ev({ code: 'KeyK', key: 'k', metaKey: true }), false],
  ] as const)('%s → %s', (_label, e, expected) => {
    expect(matchesHotkey(e, hk)).toBe(expected)
  })
})

describe('HOTKEYS.openPage (M6.1, FR-685, X49)', () => {
  it.each([
    ['Shift+Space (Kedmanee: key is still a space)', ev({ code: 'Space', key: ' ', shiftKey: true }), true],
    ['Space alone opens the panel instead', ev({ code: 'Space', key: ' ' }), false],
    ['Cmd+Shift+Space', ev({ code: 'Space', key: ' ', shiftKey: true, metaKey: true }), false],
    ['Shift+Enter', ev({ code: 'Enter', key: 'Enter', shiftKey: true }), false],
  ] as const)('%s → %s', (_label, e, expected) => {
    expect(matchesHotkey(e, HOTKEYS.openPage)).toBe(expected)
  })
})

describe('isUndoKey / isRedoKey (SPEC §8.6, X49)', () => {
  it('U-KEY-01 Ctrl+Z on the Thai Kedmanee layout is undo', () => {
    const e = ev({ code: 'KeyZ', key: 'ผ', ctrlKey: true })
    expect(isUndoKey(e)).toBe(true)
    expect(isRedoKey(e)).toBe(false)
  })

  it.each([
    ['Cmd+Z', ev({ code: 'KeyZ', key: 'z', metaKey: true })],
    ['Ctrl+Z', ev({ code: 'KeyZ', key: 'z', ctrlKey: true })],
    ['key fallback (layout that moves Z)', ev({ code: 'KeyY', key: 'z', ctrlKey: true })],
    ['key fallback upper-case (Caps Lock)', ev({ code: 'KeyW', key: 'Z', metaKey: true })],
  ])('U-KEY-01 %s is undo', (_label, e) => {
    expect(isUndoKey(e)).toBe(true)
    expect(isRedoKey(e)).toBe(false)
  })

  it.each([
    ['Cmd+Shift+Z', ev({ code: 'KeyZ', key: 'Z', metaKey: true, shiftKey: true })],
    ['Ctrl+Shift+Z (Thai layout)', ev({ code: 'KeyZ', key: '(', ctrlKey: true, shiftKey: true })],
  ])('U-KEY-02 %s is redo, not undo', (_label, e) => {
    expect(isRedoKey(e)).toBe(true)
    expect(isUndoKey(e)).toBe(false)
  })

  it.each([
    ['Ctrl+Alt+Z', ev({ code: 'KeyZ', key: 'z', ctrlKey: true, altKey: true })],
    ['Cmd+Shift+Alt+Z', ev({ code: 'KeyZ', key: 'Z', metaKey: true, shiftKey: true, altKey: true })],
  ])('U-KEY-03 %s (altKey) → neither', (_label, e) => {
    expect(isUndoKey(e)).toBe(false)
    expect(isRedoKey(e)).toBe(false)
  })

  it.each([
    ['z', ev({ code: 'KeyZ', key: 'z' })],
    ['Shift+Z', ev({ code: 'KeyZ', key: 'Z', shiftKey: true })],
    ['Ctrl+Y', ev({ code: 'KeyY', key: 'y', ctrlKey: true })],
  ])('U-KEY-04 plain %s → neither', (_label, e) => {
    expect(isUndoKey(e)).toBe(false)
    expect(isRedoKey(e)).toBe(false)
  })
})

describe('isEditableTarget (X49)', () => {
  function mount(html: string): HTMLElement {
    document.body.innerHTML = html
    return document.querySelector<HTMLElement>('[data-t]')!
  }

  it.each([
    ['<input>', '<input data-t />'],
    ['<textarea>', '<textarea data-t></textarea>'],
    ['<select>', '<select data-t></select>'],
    ['contenteditable div', '<div contenteditable="true" data-t></div>'],
    ['contenteditable (empty attribute)', '<div contenteditable data-t></div>'],
    ['child of contenteditable', '<div contenteditable="true"><span data-t>x</span></div>'],
    ['child of .bn-editor', '<div class="bn-editor"><p><span data-t>x</span></p></div>'],
  ])('U-KEY-05 %s → true', (_label, html) => {
    expect(isEditableTarget(mount(html))).toBe(true)
  })

  it.each([
    ['<button>', '<button data-t>ok</button>'],
    ['contenteditable="false"', '<div contenteditable="false" data-t></div>'],
  ])('U-KEY-05 %s → false', (_label, html) => {
    expect(isEditableTarget(mount(html))).toBe(false)
  })

  it('U-KEY-05 document.body, window and null → false', () => {
    expect(isEditableTarget(document.body)).toBe(false)
    expect(isEditableTarget(window)).toBe(false)
    expect(isEditableTarget(null)).toBe(false)
  })
})
