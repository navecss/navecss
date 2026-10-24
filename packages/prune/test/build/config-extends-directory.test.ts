/**
 * A config whose `extends` names a path with no extension, beside both a file of that name with
 * `.json` and a directory: TypeScript and Turbopack read the file. A build with Nave on Turbopack
 * ends the way one without it does, with the atoms of the aliased import shipped, cold and warm.
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

const FILES = {
  'base.json': BASE,
  'base/readme.txt': 'notes\n',
  'ui/Card.jsx':
    "import { cx } from '@navecss/core/cx'\n\nexport const Card = () => <p className={cx('flex')}>card</p>\n",
  'app/page.jsx':
    "import { Card } from '@/ui/Card'\n\nexport default function Page() {\n  return <Card />\n}\n",
}

describe.skipIf(SKIP_REASON !== undefined)(
  `an alias set in a config extended beside a directory of that name${SKIP_REASON === undefined ? '' : ` (skipped: ${SKIP_REASON})`}`,
  () => {
    it(
      'AC-nextjs-used-atoms-04: Turbopack: the build exits 0 cold and warm and ships the atom the aliased import uses',
      async () => {
        const app = createNextApp()
        apps.push(app)
        app.write({ ...FILES, 'jsconfig.json': JSON.stringify({ extends: './base' }) })

        const cold = await app.next(['build'])
        const warm = await app.next(['build'])

        expect([cold.code, warm.code], cold.output + warm.output).toEqual([0, 0])
        expect(app.builtCss()).toContain('.nave-flex')
      },
      TIMEOUT,
    )

    it(
      'AC-nextjs-used-atoms-04: webpack: control, Next.js itself fails on this layout without Nave, so a stop there is not the plugin',
      async () => {
        const app = createNextApp('export default {}\n')
        apps.push(app)
        app.write({
          ...FILES,
          'jsconfig.json': JSON.stringify({ extends: './base' }),
          'postcss.config.mjs': 'export default { plugins: {} }\n',
        })

        const run = await app.next(['build', '--webpack'])

        expect(run.code, run.output).not.toBe(0)
        expect(run.output).toContain("Module not found: Can't resolve '@/ui/Card'")
        expect(run.output).not.toContain('Nave')
      },
      TIMEOUT,
    )
  },
)
