/**
 * `AC-theming-30` covers: R25 (relocated out of
 * `packages/tokens/test/theming/remaining-ac.test.ts`).
 *
 * WHY THIS LIVES IN `@navecss/core` AND NOT IN `@navecss/tokens`. `@navecss/tokens#test`
 * declares its cache inputs from `packages/tokens/` alone (turbo's default, package-scoped),
 * so with `packages/core/src/reset.css` edited it is replayed FROM CACHE on the exact edit
 * this check exists to catch — the same shape found and fixed earlier for
 * the reduced-motion assertion (`reset-reduced-motion.test.ts`, same rationale, longer form).
 * `@navecss/core#test` hashes its own `src/reset.css` by default, so relocating here is what
 * makes the check invalidate on the edit it guards. The other half of `AC-theming-30` (the
 * tokens layer's OWN `color-scheme: light dark` emission) stays in
 * `packages/tokens/test/theming/remaining-ac.test.ts`, since that half is `tokens`-owned
 * content, not core's.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const resetCss = readFileSync(path.resolve(HERE, '../src/reset.css'), 'utf8')

describe('AC-theming-30 covers: R25', () => {
  it('the core reset no longer declares color-scheme (it moved to the tokens layer)', () => {
    expect(resetCss).not.toMatch(/color-scheme\s*:/)
  })
})
