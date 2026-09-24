/**
 * `AC-theming-48` covers: R30a (relocated out of
 * `packages/tokens/test/theming/remaining-ac.test.ts`).
 *
 * WHY THIS LIVES IN `@navecss/core` AND NOT IN `@navecss/tokens`. Same shape as
 * `reset-color-scheme.test.ts` beside it: `@navecss/tokens#test` hashes only
 * `packages/tokens/`, so a test reading `packages/core/src/index.css` from inside
 * `packages/tokens/test/` was replayed from cache on an edit to the exact file it checks.
 * `@navecss/core#test` hashes its own `src/index.css` by default, which is what makes this
 * assertion invalidate on the edit it guards.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const indexCss = readFileSync(path.resolve(HERE, '../src/index.css'), 'utf8')

describe('AC-theming-48 covers: R30a', () => {
  it("core's index.css declares tokens.defaults, tokens.presets, reset, atomic, components.nave, components.consumer, overrides in order", () => {
    const match = /^@layer\s+([^;]+);/m.exec(indexCss)
    expect(match).not.toBeNull()
    const names = match![1]!.split(',').map((s) => s.trim())
    expect(names).toEqual([
      'tokens.defaults',
      'tokens.presets',
      'reset',
      'atomic',
      'components.nave',
      'components.consumer',
      'overrides',
    ])
  })
})
