/**
 * Checked-in contract snapshot for dist/tokens.css.
 *
 * dist/tokens.css is the public CSS contract: the @property registrations
 * and the :root token block a consumer's stylesheet is written against. It
 * is never committed itself (generated output), so a pipeline change (a
 * Style Dictionary major landed one silently once, back when that tool
 * still built this package) can move it with nothing to catch the change.
 * This checked-in snapshot makes that a visible diff in review instead of
 * a surprise downstream.
 *
 * Update deliberately, via `vitest run -u`, only when the change to the
 * contract is intended — never as a reflex to make a red test green.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const TOKENS_CSS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/tokens.css')

describe('dist/tokens.css contract', () => {
  it('matches the checked-in snapshot', () => {
    expect(readFileSync(TOKENS_CSS, 'utf8')).toMatchSnapshot()
  })
})
