// src/lib/z.ts — the one Zod entry point (PLAN.md §1.2): Thai default messages for every schema in the app.
// Schema files import `z` from here (never from 'zod' directly) so the locale is configured before any parse.
import { z } from 'zod'

z.config(z.locales.th())
// Zod 4 probes `Function('')` on the first object parse to decide whether to JIT-compile parsers. Under our
// CSP (no 'unsafe-eval' in production, src/lib/csp.ts) the probe is caught by Zod but the browser still
// fires a `securitypolicyviolation` (script-src blocked=eval). jitless skips the probe; schemas here are tiny.
z.config({ jitless: true })

export { z }
