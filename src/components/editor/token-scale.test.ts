// M6.1-D24 (FR-1605, AC-1605): the editor directory is delegated by the repo-wide scan — every size, spacing, radius
// and colour here comes from the §8.12 token scale (src/app/tokens.css) or a documented `token-scale-ok` escape.
import { describe, it } from 'vitest'
import { expectTokenScale } from '@/lib/theme/token-scale'

describe('token scale — src/components/editor', () => {
  it('has no raw px / rem font sizes, spacing, radii or colour literals', () => {
    expectTokenScale('src/components/editor')
  })
})
