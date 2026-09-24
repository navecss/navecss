/**
 * `ATOMS.md` is generated (`scripts/generate-atoms-doc.ts`) and committed. This test regenerates
 * it in memory and diffs against the committed file, so an `atoms.ts` edit that is not
 * accompanied by regenerating the doc reds here rather than shipping a stale reference table
 * (`CONSUMER-ATOMS.md` said "~40" while the real count was 48 — the failure mode this guards).
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { generate, OUTPUT_PATH } from '../scripts/generate-atoms-doc.ts'

describe('ATOMS.md stays in sync with src/atoms.ts', () => {
  it('the committed file matches what the generator produces', async () => {
    const committed = readFileSync(OUTPUT_PATH, 'utf8')
    expect(committed).toBe(await generate())
  })
})
