// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyText } from './copy-text'

const nav = navigator as Navigator & { clipboard?: Clipboard }

function setClipboard(value: Partial<Clipboard> | undefined) {
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true })
}

afterEach(() => {
  setClipboard(undefined)
  Reflect.deleteProperty(document, 'execCommand')
  vi.unstubAllGlobals()
})

describe('copyText', () => {
  it('U-COPY-01 uses the async clipboard API in a secure context', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    setClipboard({ writeText })
    vi.stubGlobal('isSecureContext', true)
    const exec = vi.fn(() => true)
    Object.defineProperty(document, 'execCommand', { value: exec, configurable: true })
    await expect(copyText('Abc-123')).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith('Abc-123')
    expect(exec).not.toHaveBeenCalled()
  })

  it('U-COPY-02 falls back to execCommand("copy") when navigator.clipboard is undefined (plain HTTP)', async () => {
    setClipboard(undefined)
    expect(nav.clipboard).toBeUndefined()
    let copied = ''
    const exec = vi.fn((cmd: string) => {
      const el = document.activeElement
      if (cmd === 'copy' && el instanceof HTMLTextAreaElement) copied = el.value.slice(el.selectionStart, el.selectionEnd)
      return true
    })
    Object.defineProperty(document, 'execCommand', { value: exec, configurable: true })
    await expect(copyText('Abc-123')).resolves.toBe(true)
    expect(exec).toHaveBeenCalledWith('copy')
    expect(copied).toBe('Abc-123')
    expect(document.querySelector('textarea')).toBeNull() // cleaned up
  })

  it('falls back when the clipboard API rejects, and reports failure when nothing works', async () => {
    setClipboard({ writeText: () => Promise.reject(new Error('denied')) })
    vi.stubGlobal('isSecureContext', true)
    Object.defineProperty(document, 'execCommand', { value: () => false, configurable: true })
    await expect(copyText('x')).resolves.toBe(false)
  })
})
