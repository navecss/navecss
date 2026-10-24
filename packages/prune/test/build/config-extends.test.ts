/**
 * A tsconfig whose `extends` names a path with no extension, beside a directory of that name: the
 * file is the config, the directory is never declared to the bundler as a file it depends on, and
 * the build exits 0 cold and warm.
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
      'AC-nextjs-used-atoms-04: Turbopack: the build exits 0, cold and warm, with a directory beside the extended file',
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

        expect([cold.code, warm.code], cold.output + warm.output).toEqual([0, 0])
        expect(app.builtCss()).toContain('.nave-flex')
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
