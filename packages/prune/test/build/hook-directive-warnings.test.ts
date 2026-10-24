/**
 * AC-nextjs-used-atoms-03 on real builds: with `onUnknown: 'warn'` a build that has an unknown
 * atom in a stylesheet exits 0 and prints the problem as a warning, on the cold build and on the
 * warm one that no longer runs the plugin, whichever bundler runs it.
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

const BUNDLERS: [string, string[]][] = [
  ['Turbopack', []],
  ['webpack', ['--webpack']],
]

const CONFIG =
  "import { withNave } from '@navecss/prune'\n\nexport default withNave({}, { onUnknown: 'warn' })\n"
const GLOBALS =
  "@import url('@navecss/core/layers');\n@import url('@navecss/core');\n\n.card {\n  @nave interactve;\n}\n"

/**
 * How many times `text` occurs in `output`.
 */
function occurrences(output: string, text: string): number {
  return output.split(text).length - 1
}

describe.skipIf(SKIP_REASON !== undefined)(
  `the unknown atom under onUnknown "warn" in next build${SKIP_REASON === undefined ? '' : ` (skipped: ${SKIP_REASON})`}`,
  () => {
    it.each(BUNDLERS)(
      '%s: AC-nextjs-used-atoms-03: the cold build and the warm one each print the problem once, as a warning, and exit 0',
      async (_bundler, flags) => {
        const app = createNextApp(CONFIG)
        apps.push(app)
        app.write({ 'app/globals.css': GLOBALS })
        const cold = await app.next(['build', ...flags])
        expect(cold.code, cold.output).toBe(0)
        expect(cold.output).toMatch(/^app\/globals\.css:\d+:\d+: .*unknown atom "interactve"/mu)
        expect(occurrences(cold.output, 'unknown atom "interactve"'), cold.output).toBe(1)
        const warm = await app.next(['build', ...flags])
        expect(warm.code, warm.output).toBe(0)
        expect(warm.output).toMatch(/^app\/globals\.css:\d+:\d+: .*unknown atom "interactve"/mu)
        expect(occurrences(warm.output, 'unknown atom "interactve"'), warm.output).toBe(1)
      },
      TIMEOUT,
    )
  },
)
