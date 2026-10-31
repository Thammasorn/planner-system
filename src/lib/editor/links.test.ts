import { describe, expect, it } from 'vitest'
import { resolveLinkTarget } from './links'

const O = 'https://plan.example.co.th'

describe('resolveLinkTarget', () => {
  it('same-origin paths and URLs stay in the app', () => {
    expect(resolveLinkTarget('/p/abc', O)).toEqual({ kind: 'internal', path: '/p/abc' })
    expect(resolveLinkTarget(`${O}/p/abc?x=1#h`, O)).toEqual({ kind: 'internal', path: '/p/abc?x=1#h' })
  })
  it('other safe links open externally', () => {
    expect(resolveLinkTarget('https://example.com/spec', O)).toEqual({
      kind: 'external',
      href: 'https://example.com/spec',
    })
    expect(resolveLinkTarget('mailto:cindy@corp.co.th', O)).toEqual({
      kind: 'external',
      href: 'mailto:cindy@corp.co.th',
    })
  })
  it('unsafe links go nowhere', () => {
    expect(resolveLinkTarget('javascript:alert(1)', O)).toBeNull()
    expect(resolveLinkTarget('//evil.example', O)).toBeNull()
    expect(resolveLinkTarget('ftp://x', O)).toBeNull()
  })
})
