/**
 * AC-nextjs-used-atoms-23 on real builds: another wrapper outside `withNave()` that sets
 * `distDir` leaves a correct build green on both bundlers, and `withNave()` outermost still does.
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

const OTHER = "const other = (config) => ({ ...config, distDir: 'build' })\n"
const OUTSIDE = `import { withNave } from '@navecss/prune'\n\n${OTHER}\nexport default other(withNave({}))\n`
const OUTERMOST = `import { withNave } from '@navecss/prune'\n\n${OTHER}\nexport default withNave(other({}))\n`

describe.skipIf(SKIP_REASON !== undefined)(
  `another wrapper around withNave() in next build${SKIP_REASON === undefined ? '' : ` (skipped: ${SKIP_REASON})`}`,
  () => {
    it.each(BUNDLERS)(
      '%s: AC-nextjs-used-atoms-23: a wrapper outside withNave() that sets distDir leaves a correct build green',
      async (_bundler, flags) => {
        const app = createNextApp(OUTSIDE)
        apps.push(app)
        const run = await app.next(['build', ...flags])
        expect(run.code, run.output).toBe(0)
        expect(run.output).not.toContain('no record from')
      },
      TIMEOUT,
    )

    it.each(BUNDLERS)(
      '%s: AC-nextjs-used-atoms-23: control, withNave() outermost with the other wrapper inside is green',
      async (_bundler, flags) => {
        const app = createNextApp(OUTERMOST)
        apps.push(app)
        const run = await app.next(['build', ...flags])
        expect(run.code, run.output).toBe(0)
      },
      TIMEOUT,
    )
  },
)
