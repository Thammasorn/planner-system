import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach } from 'vitest'

// jsdom has no pointer capture; sonner calls it when a toast is pressed.
Element.prototype.setPointerCapture ??= () => {}

// RTL only auto-registers cleanup when `afterEach` is a global (test.globals: true). We keep globals off.
afterEach(() => {
  cleanup()
  toast.dismiss() // sonner keeps toasts in a module-level store between tests
})
