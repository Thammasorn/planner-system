// M4 S1.2 — page / file authorization (SPEC §3.2 PERM-16…19, FR-510, X41/X42/X63, M4-D17/D24/D31).
import { beforeEach, describe, expect, it } from 'vitest'
import { toSessionUser } from '../../tests/helpers/as-user'
import { createWorld, type World } from '../../tests/helpers/world'
import {
  assertSecondPage,
  effectiveProtection,
  requireFile,
  requirePage,
  requirePageCreate,
  requireSubtreeUnprotected,
} from './authz'
import { db } from './db/client'
import { ForbiddenError, NotFoundError, ValidationError } from './errors'

const S = toSessionUser
let w: World

beforeEach(async () => {
  w = await createWorld({ with: ['pages', 'files'] })
})

describe('requirePage', () => {
  it('PROJECT pages follow project visibility; archived → read-only', async () => {
    await expect(requirePage(db, S(w.outsider), w.pages.pPage.id, 'view')).rejects.toBeInstanceOf(NotFoundError)
    const a = await requirePage(db, S(w.member), w.pages.pPage.id, 'edit')
    expect(a).toMatchObject({ role: 'MEMBER', archived: false, effectiveProtected: false, isManager: false })
    expect(a.page.id).toBe(w.pages.pPage.id)
    await expect(requirePage(db, S(w.member), w.pages.aPage.id, 'view')).resolves.toMatchObject({ archived: true })
    await expect(requirePage(db, S(w.member), w.pages.aPage.id, 'edit')).rejects.toBeInstanceOf(ForbiddenError)
    await expect(requirePage(db, S(w.lead), w.pages.pPage.id, 'view')).resolves.toMatchObject({ role: 'LEAD' })
    await expect(requirePage(db, S(w.manager), w.pages.qPage.id, 'view')).resolves.toMatchObject({
      role: 'MANAGER',
      isManager: true,
    })
  })

  it('WORKSPACE pages: anyone views/edits; protection inherits for workers only', async () => {
    await expect(requirePage(db, S(w.outsider), w.pages.wiki.id, 'edit')).resolves.toMatchObject({ role: 'WIKI' })
    await expect(requirePage(db, S(w.member), w.pages.wikiProtectedChild.id, 'view')).resolves.toMatchObject({
      effectiveProtected: true,
    })
    await expect(requirePage(db, S(w.member), w.pages.wikiProtectedChild.id, 'edit')).rejects.toBeInstanceOf(
      ForbiddenError,
    )
    const m = await requirePage(db, S(w.manager), w.pages.wikiProtectedChild.id, 'edit')
    expect(m).toMatchObject({ role: 'MANAGER', effectiveProtected: true })
  })

  it("protect: managers on wiki pages; workers 403; managers on PROJECT pages → VALIDATION", async () => {
    await expect(requirePage(db, S(w.lead), w.pages.wiki.id, 'protect')).rejects.toBeInstanceOf(ForbiddenError)
    await expect(requirePage(db, S(w.manager), w.pages.wiki.id, 'protect')).resolves.toBeDefined()
    await expect(requirePage(db, S(w.manager), w.pages.pPage.id, 'protect')).rejects.toBeInstanceOf(ValidationError)
    await expect(requirePage(db, S(w.member), w.pages.pPage.id, 'protect')).rejects.toBeInstanceOf(ForbiddenError)
    await expect(requirePage(db, S(w.outsider), w.pages.pPage.id, 'protect')).rejects.toBeInstanceOf(NotFoundError)
  })

  it('deleted, missing and malformed ids → 404', async () => {
    await expect(requirePage(db, S(w.member), w.deletedPages.pDeleted.id, 'view')).rejects.toBeInstanceOf(
      NotFoundError,
    )
    await expect(requirePage(db, S(w.manager), w.deletedPages.wikiDeleted.id, 'view')).rejects.toBeInstanceOf(
      NotFoundError,
    )
    await expect(requirePage(db, S(w.manager), 'x', 'view')).rejects.toBeInstanceOf(NotFoundError)
    await expect(
      requirePage(db, S(w.manager), '3f2504e0-4f89-41d3-9a0c-0305e82c3301', 'view'),
    ).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe('effectiveProtection / requireSubtreeUnprotected', () => {
  it('inherits from ancestors; subtree check blocks workers only', async () => {
    expect(await effectiveProtection(db, w.pages.wikiProtectedChild.id)).toBe(true)
    expect(await effectiveProtection(db, w.pages.wikiFolder.id)).toBe(false)
    expect(await effectiveProtection(db, w.pages.wikiFolderLocked.id)).toBe(true)
    await expect(requireSubtreeUnprotected(db, S(w.member), w.pages.wikiFolder.id)).rejects.toBeInstanceOf(
      ForbiddenError,
    )
    await expect(requireSubtreeUnprotected(db, S(w.manager), w.pages.wikiFolder.id)).resolves.toBeUndefined()
    await expect(requireSubtreeUnprotected(db, S(w.member), w.pages.wiki.id)).resolves.toBeUndefined()
  })
})

describe('requirePageCreate / assertSecondPage (M4-D31 order)', () => {
  it('roots: PROJECT via requireProject(edit), WORKSPACE for anyone', async () => {
    const P = { space: 'PROJECT' as const, projectId: w.P.id, parentId: null }
    await expect(requirePageCreate(db, S(w.member), P)).resolves.toEqual({ parent: null })
    await expect(requirePageCreate(db, S(w.outsider), P)).rejects.toBeInstanceOf(NotFoundError)
    await expect(
      requirePageCreate(db, S(w.member), { space: 'PROJECT', projectId: w.A.id, parentId: null }),
    ).rejects.toBeInstanceOf(ForbiddenError)
    await expect(
      requirePageCreate(db, S(w.outsider), { space: 'WORKSPACE', projectId: null, parentId: null }),
    ).resolves.toEqual({ parent: null })
  })

  it('parents: invisible → 404, other space → 400 (visible only), protected → 403', async () => {
    const underQ = { space: 'PROJECT' as const, projectId: w.P.id, parentId: w.pages.qPage.id }
    await expect(requirePageCreate(db, S(w.member), underQ)).rejects.toBeInstanceOf(NotFoundError)
    await expect(requirePageCreate(db, S(w.manager), underQ)).rejects.toBeInstanceOf(ValidationError)
    // outsider sees qPage but not the target project P → 404, never 400
    await expect(requirePageCreate(db, S(w.outsider), underQ)).rejects.toBeInstanceOf(NotFoundError)
    await expect(
      requirePageCreate(db, S(w.member), { space: 'WORKSPACE', projectId: null, parentId: w.pages.wikiProtected.id }),
    ).rejects.toBeInstanceOf(ForbiddenError)
    const ok = await requirePageCreate(db, S(w.member), {
      space: 'PROJECT',
      projectId: w.P.id,
      parentId: w.pages.pPage.id,
    })
    expect(ok.parent?.page.id).toBe(w.pages.pPage.id)
    await expect(
      assertSecondPage(db, S(w.member), w.pages.wiki.id, { space: 'PROJECT', projectId: w.P.id }),
    ).rejects.toBeInstanceOf(ValidationError)
    await expect(
      assertSecondPage(db, S(w.member), w.pages.aPage.id, { space: 'PROJECT', projectId: w.A.id }),
    ).rejects.toBeInstanceOf(ForbiddenError)
  })
})

describe('requireFile (M4-D17)', () => {
  it('by files.project_id only', async () => {
    await expect(requireFile(db, S(w.outsider), w.files.pImage.id)).rejects.toBeInstanceOf(NotFoundError)
    await expect(requireFile(db, S(w.outsider), w.files.qFile.id)).resolves.toMatchObject({
      file: { id: w.files.qFile.id },
    })
    await expect(requireFile(db, S(w.member), w.files.wikiFile.id)).resolves.toBeDefined()
    await expect(requireFile(db, S(w.member), w.files.aFile.id)).resolves.toBeDefined()
    await expect(requireFile(db, S(w.member), 'x')).rejects.toBeInstanceOf(NotFoundError)
  })
})
