// S0.1 — dependency pins for the editor (PLAN §1.2): exact BlockNote/Mantine/file-type versions, no GPL xl-* packages.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const pkg = JSON.parse(readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}
const all = { ...pkg.dependencies, ...pkg.devDependencies }

describe('editor dependencies', () => {
  it('has no @blocknote/xl-* (GPL/commercial) or other forbidden packages', () => {
    const keys = Object.keys(all)
    expect(keys.filter((k) => k.startsWith('@blocknote/xl-'))).toEqual([])
    for (const k of [
      '@blocknote/server-util',
      '@blocknote/code-block',
      '@blocknote/shadcn',
      'emoji-mart',
      'react-hook-form',
    ])
      expect(keys, k).not.toContain(k)
  })

  it('pins exact versions', () => {
    for (const k of ['@blocknote/core', '@blocknote/react', '@blocknote/mantine'])
      expect(all[k], k).toBe('0.55.0')
    expect(all['@mantine/core']).toBe('9.6.3')
    expect(all['@mantine/hooks']).toBe('9.6.3')
    expect(all['file-type']).toBe('22.1.1')
    expect(all.cmdk).toBe('1.1.1')
  })
})
