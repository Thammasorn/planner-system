import { describe, expect, it } from 'vitest'
import { HOTKEYS, matchesHotkey, type HotkeyEvent } from './keys'

function ev(p: Partial<HotkeyEvent> & Pick<HotkeyEvent, 'code' | 'key'>): HotkeyEvent {
  return { metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...p }
}

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
