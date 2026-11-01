// src/lib/theme/token-scale.repo.test.ts — the repo-wide token-scale check of `pnpm check` (FR-1605, AC-1605;
// plan/m06.1 S4.9, M6.1-D24). Scans src/app/** (minus tokens.css and global-error.tsx), every src/components/*
// directory and top-level file, and src/hooks — except the directories delegated to their owning streams (tasks,
// palette, editor, grid), each of which must carry its own co-located token-scale.test.ts (asserted here, so a
// delegated directory can never silently drop out of the check). Every `token-scale-ok` escape is printed.
import { existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { collectTokenScale, DEFAULT_EXCLUDES, expectTokenScale } from './token-scale'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const COMPONENTS = path.join(ROOT, 'src/components')

/** Directories with their own co-located token-scale test (M6.1-D24). */
const DELEGATED = ['tasks', 'palette', 'editor', 'grid'] as const

const componentDirs = (): string[] =>
  readdirSync(COMPONENTS)
    .filter((d) => statSync(path.join(COMPONENTS, d)).isDirectory())
    .filter((d) => !(DELEGATED as readonly string[]).includes(d))
    .sort()

describe('token scale — repo (FR-1605, AC-1605)', () => {
  it('the exclusions are exactly the M6.1-D24 list', () => {
    expect([...DEFAULT_EXCLUDES].sort()).toEqual(
      ['src/app/global-error.tsx', 'src/app/tokens.css', 'src/lib/theme/theme.ts'].sort(),
    )
  })

  it('src/app has no off-scale font size, spacing, radius or literal colour', () => {
    expect(() => expectTokenScale(path.join(ROOT, 'src/app'))).not.toThrow()
  })

  it.each(componentDirs())('src/components/%s has no off-scale values', (dir) => {
    expect(() => expectTokenScale(path.join(COMPONENTS, dir))).not.toThrow()
  })

  it('top-level component files (Link.tsx …) and src/hooks have no off-scale values', () => {
    const dirs = readdirSync(COMPONENTS).filter((d) => statSync(path.join(COMPONENTS, d)).isDirectory())
    const top = collectTokenScale(COMPONENTS, { exclude: dirs.map((d) => `src/components/${d}/`) })
    expect(top.files).toBeGreaterThanOrEqual(1)
    expect(top.violations).toEqual([])
    expect(() => expectTokenScale(path.join(ROOT, 'src/hooks'))).not.toThrow()
  })

  it.each(DELEGATED)('delegated src/components/%s carries its own token-scale.test.ts', (dir) => {
    expect(existsSync(path.join(COMPONENTS, dir, 'token-scale.test.ts'))).toBe(true)
  })

  it('scans real sources (not only tests): app routes and the shell', () => {
    expect(collectTokenScale(path.join(ROOT, 'src/app')).files).toBeGreaterThanOrEqual(30)
    expect(collectTokenScale(path.join(COMPONENTS, 'shell')).files).toBeGreaterThanOrEqual(10)
  })
})
