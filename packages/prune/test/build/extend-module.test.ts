/**
 * A path-valued `extend` module on a real build, both bundlers: after an edit to it, a warm build
 * expands `@nave` with the edited atom. The module is a file the plugin reads, declared to the
 * bundler like any other, so the stylesheet that uses it runs again.
 */
import { afterEach, describe, expect, it } from 'vitest'

import type { NextApp } from '../helpers/next-app.ts'

import { createNextApp, SKIP_REASON } from '../helpers/next-app.ts'

const TIMEOUT = 900_000

const apps: NextApp[] = []
afterEach(async () => {
  for (const app of apps) await app.remove()
  apps.length = 0
})

const CONFIG = [
  "import { withNave } from '@navecss/prune'",
  '',
  "export default withNave({}, { extend: './atoms.mjs' })",
  '',
].join('\n')

/**
 * The extend module, defining `brandBox` with `outline-offset: <offset>`.
 */
function atoms(offset: string): string {
  const map = { brandBox: { declarations: { 'outline-offset': offset } } }
  return `export default ${JSON.stringify(map)}\n`
}

const GLOBALS = [
  "@import url('@navecss/core/layers');",
  "@import url('@navecss/core');",
  '',
  '.card {',
  '  @nave brandBox;',
  '}',
  '',
].join('\n')

/**
 * The declarations of the `.card` rule in the built CSS.
 */
function cardRule(css: string): string {
  return /\.card\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''
}

describe.skipIf(SKIP_REASON !== undefined)(
  `an extend module edited between builds${SKIP_REASON === undefined ? '' : ` (skipped: ${SKIP_REASON})`}`,
  () => {
    it.each([
      ['Turbopack', []],
      ['webpack', ['--webpack']],
    ])(
      '%s: the warm build expands @nave with the edited atom',
      async (_bundler, flags) => {
        const app = createNextApp(CONFIG)
        apps.push(app)
        app.write({ 'atoms.mjs': atoms('7px'), 'app/globals.css': GLOBALS })
        const cold = await app.next(['build', ...flags])
        expect(cold.code, cold.output).toBe(0)
        expect(cardRule(app.builtCss())).toContain('7px')
        app.write({ 'atoms.mjs': atoms('9px') })
        const warm = await app.next(['build', ...flags])
        expect(warm.code, warm.output).toBe(0)
        expect(cardRule(app.builtCss())).toContain('9px')
      },
      TIMEOUT,
    )
  },
)
