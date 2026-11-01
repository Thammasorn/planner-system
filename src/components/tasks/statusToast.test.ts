import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { statusToastMessage } from './statusToast'

describe('statusToastMessage (BR-52, M6-D16)', () => {
  it('released load replaces the fallback, 1 decimal half-up', () => {
    expect(statusToastMessage({ released: { cd: 1875, weeks: 5 } }, 'fallback')).toBe('ปลดภาระ 18.8 วัน ในอีก 5 สัปดาห์')
    expect(statusToastMessage({ released: { cd: 125, weeks: 1 } }, 'x')).toBe(th.tasks.toast.released('1.3', 1))
  })
  it('null released → the path’s own message', () => {
    expect(statusToastMessage({ released: null }, th.tasks.toast.completed)).toBe(th.tasks.toast.completed)
  })
})
