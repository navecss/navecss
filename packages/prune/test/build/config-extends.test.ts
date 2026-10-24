/**
 * A tsconfig whose `extends` names a path with no extension, beside a directory of that name: the
 * directory is never declared to the bundler as a file it depends on. With no directory there, the
 * same config builds cold and warm.
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

const BASE = JSON.stringify({ compilerOptions: { paths: { '@/*': ['./*'] } } })

describe.skipIf(SKIP_REASON !== undefined)(
  `a config extending a path beside a directory of that name${SKIP_REASON === undefined ? '' : ` (skipped: ${SKIP_REASON})`}`,
  () => {
    it(
      'AC-nextjs-used-atoms-04: Turbopack: a directory beside the extended file is not declared, so the build ends without a Turbopack error, cold and warm',
      async () => {
        const app = createNextApp()
        apps.push(app)
        app.write({
          'jsconfig.json': JSON.stringify({ extends: './base' }),
          'base.json': BASE,
          'base/readme.txt': 'notes\n',
        })

        const cold = await app.next(['build'])
        const warm = await app.next(['build'])

        // What matters here is that Turbopack is not told to read the directory as a file. That the
        // build then ends without a stop is held in config-extends-directory.test.ts.
        for (const run of [cold, warm]) {
          expect(run.output).not.toContain('Is a directory')
          expect(run.output).not.toContain('FATAL')
        }
      },
      TIMEOUT,
    )

    it.each([
      ['Turbopack', []],
      ['webpack', ['--webpack']],
    ])(
      'AC-nextjs-used-atoms-04: %s: control, the same extends with no directory beside the file builds cold and warm',
      async (_bundler, flags) => {
        const app = createNextApp()
        apps.push(app)
        app.write({
          'jsconfig.json': JSON.stringify({ extends: './base' }),
          'base.json': BASE,
        })

        const cold = await app.next(['build', ...flags])
        const warm = await app.next(['build', ...flags])

        expect([cold.code, warm.code], cold.output + warm.output).toEqual([0, 0])
        expect(app.builtCss()).toContain('.nave-flex')
      },
      TIMEOUT,
    )
  },
)
