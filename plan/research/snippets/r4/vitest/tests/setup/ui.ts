import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// RTL only auto-registers cleanup when `afterEach` is a global (test.globals: true). We keep globals off.
afterEach(() => {
  cleanup()
})
