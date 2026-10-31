import { describe, expect, it } from 'vitest'
import {
  createPageSchema,
  pageTitleSchema,
  titlesQuerySchema,
  treeQuerySchema,
  uploadFieldsSchema,
} from './pages'

const A = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'
const B = '9b2e7f1c-1d2a-4c3b-8e4f-5a6b7c8d9e0f'

describe('page schemas', () => {
  it('createPageSchema ties space to projectId', () => {
    expect(createPageSchema.safeParse({ space: 'PROJECT', projectId: null, parentId: null }).success).toBe(
      false,
    )
    expect(createPageSchema.safeParse({ space: 'WORKSPACE', projectId: A, parentId: null }).success).toBe(
      false,
    )
    expect(createPageSchema.safeParse({ space: 'PROJECT', projectId: A, parentId: null }).success).toBe(true)
    expect(
      createPageSchema.safeParse({ space: 'WORKSPACE', projectId: null, parentId: B, afterId: null }).success,
    ).toBe(true)
  })

  it('titlesQuerySchema: 1…100 uuids', () => {
    expect(titlesQuerySchema.parse({ ids: `${A},${B}` }).ids).toEqual([A, B])
    expect(titlesQuerySchema.safeParse({ ids: Array.from({ length: 101 }, () => A).join(',') }).success).toBe(
      false,
    )
    expect(titlesQuerySchema.safeParse({ ids: 'x' }).success).toBe(false)
    expect(titlesQuerySchema.safeParse({ ids: '' }).success).toBe(false)
  })

  it('pageTitleSchema trims and caps at 200', () => {
    expect(pageTitleSchema.parse('  x ')).toBe('x')
    expect(pageTitleSchema.safeParse('a'.repeat(201)).success).toBe(false)
    expect(pageTitleSchema.safeParse('a'.repeat(200)).success).toBe(true)
  })

  it('treeQuerySchema requires projectId exactly for PROJECT', () => {
    expect(treeQuerySchema.safeParse({ space: 'PROJECT' }).success).toBe(false)
    expect(treeQuerySchema.safeParse({ space: 'WORKSPACE', projectId: A }).success).toBe(false)
    expect(treeQuerySchema.safeParse({ space: 'PROJECT', projectId: A, parentId: B }).success).toBe(true)
  })

  it('uploadFieldsSchema defaults purpose to content', () => {
    expect(uploadFieldsSchema.parse({ pageId: A })).toEqual({ pageId: A, purpose: 'content' })
  })
})
