// S2.3 — client/server schema parity (M4-D37a) + FR-521 block choices (jsdom: the schema module imports React specs).
import { describe, expect, it } from 'vitest'
import { BLOCK_TYPES } from '@/lib/schemas/page-content'
import { IMAGE_MIME } from '@/lib/files/upload-rules'
import { HEADING_LEVELS, schema } from './schema'

describe('editor schema', () => {
  it('has exactly the block types the server accepts', () => {
    expect(Object.keys(schema.blockSpecs).sort()).toEqual([...BLOCK_TYPES].sort())
  })

  it('headings are H1–H3 only', () => {
    expect([...HEADING_LEVELS]).toEqual([1, 2, 3])
    expect(schema.blockSpecs.heading.config.propSchema.level.values).toEqual([1, 2, 3])
  })

  it('images accept only the four raster types; attachments keep type "file" with a size prop', () => {
    expect(schema.blockSpecs.image.implementation.meta?.fileBlockAccept).toEqual([...IMAGE_MIME])
    expect(schema.blockSpecs.file.config.propSchema.size.default).toBe(0)
  })

  it('has the mention inline content and the default styles', () => {
    expect(Object.keys(schema.inlineContentSpecs)).toEqual(
      expect.arrayContaining(['text', 'link', 'mention']),
    )
    expect(Object.keys(schema.styleSpecs)).toEqual(
      expect.arrayContaining([
        'bold',
        'italic',
        'underline',
        'strike',
        'code',
        'textColor',
        'backgroundColor',
      ]),
    )
  })
})
