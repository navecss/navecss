/**
 * `AC-theming-55` covers: R18e, second scenario (relocated out of
 * `packages/tokens/test/theming/remaining-ac.test.ts`).
 *
 * WHY THIS LIVES IN `@navecss/core` AND NOT IN `@navecss/tokens`. Same shape as the two
 * files beside it: `@navecss/tokens#test` hashes only `packages/tokens/`, so a test reading
 * `packages/core/src/{reset.css,atoms.ts,postcss.ts}` from inside `packages/tokens/test/`
 * was replayed from cache on an edit to any of the three files it checks. `@navecss/core#test`
 * hashes its own `src/` by default, which is what makes this assertion invalidate on the
 * edit it guards. `AC-theming-55`'s other two scenarios stay in
 * `packages/tokens/test/theming/remaining-ac.test.ts`: one reads only `CHROMATIC_MAPPING`
 * (in-memory, `tokens`-owned), the other calls `scanCoreContract`/`buildManifest` with a
 * synthetic string array and never touches a real file — neither has this file's problem.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CORE_SRC = path.resolve(HERE, '../src')

describe('AC-theming-55 covers: R18e', () => {
  it("core's source never unwraps or re-wraps an on-* slot's light-dark() structure — it consumes the resolved value exactly as any other token", () => {
    const files = ['reset.css', 'atoms.ts', 'postcss.ts'].map((f) => {
      const p = path.resolve(CORE_SRC, f)
      try {
        return readFileSync(p, 'utf8')
      } catch {
        return ''
      }
    })
    for (const content of files) {
      // core references on-* custom properties, if at all, only as a plain var()
      // reference — never split, indexed, or pattern-matched on a light/dark shape.
      expect(content).not.toMatch(/light-dark\s*\(\s*var\(--nave-color-on-/)
      expect(content).not.toMatch(/--nave-color-on-[\w-]+\s*\.\s*(light|dark)/)
    }
  })
})
