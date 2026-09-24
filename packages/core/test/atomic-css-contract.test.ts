/**
 * Checked-in contract snapshot for dist/atomic.css.
 *
 * dist/atomic.css is the public global-class contract generated from
 * atoms.ts: one .nave-* class per atom, nested pseudo/media shapes and all.
 * It is never committed itself (generated output), so a change to atoms.ts
 * or to the generator can move the shipped classes with nothing to catch
 * the drift beyond the narrower per-shape assertions in atomic-css.test.ts.
 * This checked-in snapshot makes the whole emitted file a visible diff in
 * review instead of a surprise downstream.
 *
 * Update deliberately, via `vitest run -u`, only when the change to the
 * contract is intended — never as a reflex to make a red test green.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const ATOMIC_CSS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/atomic.css')

describe('dist/atomic.css contract', () => {
  it('matches the checked-in snapshot', () => {
    expect(readFileSync(ATOMIC_CSS, 'utf8')).toMatchSnapshot()
  })
})
