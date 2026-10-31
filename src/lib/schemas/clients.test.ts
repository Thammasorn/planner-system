import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { clientIdSchema, createClientSchema, updateClientSchema } from './clients'

const CID = '6f1c1d2e-3b4a-4c5d-8e9f-0a1b2c3d4e5f'

describe('client schemas (FR-301, M2-D15)', () => {
  it('name is trimmed, required and ≤ 120 chars', () => {
    expect(createClientSchema.parse({ name: '  SCB ' })).toEqual({ name: 'SCB' })
    expect(createClientSchema.safeParse({ name: ' ' }).error?.issues[0]?.message).toBe(
      th.clients.errors.nameRequired,
    )
    expect(createClientSchema.safeParse({ name: 'x'.repeat(121) }).error?.issues[0]?.message).toBe(
      th.clients.errors.nameTooLong,
    )
    expect(createClientSchema.safeParse({ name: 'x'.repeat(120) }).success).toBe(true)
  })

  it('colour is optional and nullable; code / note empty → null', () => {
    expect(createClientSchema.parse({ name: 'A', color: null, code: '', note: '' })).toEqual({
      name: 'A',
      color: null,
      code: null,
      note: null,
    })
    expect(createClientSchema.parse({ name: 'A', color: '#b91c1c' }).color).toBe('#B91C1C')
    expect(createClientSchema.safeParse({ name: 'A', note: 'x'.repeat(2001) }).success).toBe(false)
  })

  it('update and id schemas', () => {
    expect(updateClientSchema.parse({ clientId: CID, name: ' B ' })).toEqual({ clientId: CID, name: 'B' })
    expect(updateClientSchema.parse({ clientId: CID })).toEqual({ clientId: CID })
    expect(clientIdSchema.safeParse({ clientId: 'nope' }).success).toBe(false)
  })
})
