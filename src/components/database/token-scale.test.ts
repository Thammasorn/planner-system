// FR-1605 / M11-D2 (plan/m11 S3.8): the database UI uses only the SPEC §8.12 token scale (dark mode via tokens).
import { expect, it } from 'vitest'
import { expectTokenScale } from '@/lib/theme/token-scale'

it('src/components/database uses only the §8.12 token scale', () => {
  expect(() => expectTokenScale('src/components/database')).not.toThrow()
})
