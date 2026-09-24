/**
 * `TOKENS.md` is generated (`generate-tokens-doc.ts`) and committed. This test regenerates it
 * in memory, from the same composed build the CSS platform writes to `dist/tokens.css`, and
 * diffs against the committed file, so a token edit that changes what ships (a new slot, a
 * value moved on or off the tint) reds here rather than leaving the reference table stale.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { generate, OUTPUT_PATH } from '../generate-tokens-doc.ts'

describe('TOKENS.md stays in sync with what the build ships', () => {
  it('the committed file matches what the generator produces', async () => {
    const committed = readFileSync(OUTPUT_PATH, 'utf8')
    expect(committed).toBe(await generate())
  })
})
