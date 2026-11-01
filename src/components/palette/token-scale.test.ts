// FR-1605 / AC-1605 (M6.1-D24): the command palette is a delegated directory of the token-scale check — every font
// size, spacing, radius and colour here comes from the SPEC §8.12 tokens (plan/m06.1 S3.8).
import { expect, it } from 'vitest'
import { expectTokenScale } from '@/lib/theme/token-scale'

it('src/components/palette uses only the §8.12 token scale', () => {
  expect(() => expectTokenScale('src/components/palette')).not.toThrow()
})
