/**
 * The plugin declares the router directories Next.js reads (`app/`, `pages/`, and both under
 * `src/`) whether or not they exist yet. Both bundlers accept a declaration of a directory that
 * does not exist, and a route created in one later is read: on Turbopack's dev server that
 * declaration is what runs the plugin again.
 */
import { afterEach, describe, expect, it } from 'vitest'

import type { NextApp } from '../helpers/next-app.ts'

import { createNextApp, SKIP_REASON } from '../helpers/next-app.ts'

const BUILD_TIMEOUT = 900_000
const DEV_TIMEOUT = 900_000

const apps: NextApp[] = []
afterEach(async () => {
  for (const app of apps) await app.remove()
  apps.length = 0
})

const LATER_ROUTE = {
  'pages/later.jsx': [
    "import { cx } from '@navecss/core/cx'",
    '',
    'export default function Later() {',
    "  return <div className={cx('grid')} />",
    '}',
    '',
  ].join('\n'),
}

const ABSENT = ['pages/', 'src/', 'src/app/', 'src/pages/']

describe.skipIf(SKIP_REASON !== undefined)(
  `router directories that do not exist yet${SKIP_REASON === undefined ? '' : ` (skipped: ${SKIP_REASON})`}`,
  () => {
    it(
      'Turbopack: next dev accepts them, and a pages/ route created later ships its atom',
      async () => {
        const app = createNextApp()
        apps.push(app)
        const server = await app.dev([])
        expect(await server.css('/')).toContain('.nave-flex')
        expect(Object.keys(app.record()?.directories ?? {})).toEqual(expect.arrayContaining(ABSENT))
        app.write(LATER_ROUTE)
        await server.untilCss('/', '.nave-grid', { rewrite: () => app.write(LATER_ROUTE) })
        await server.stop()
        expect(server.output()).not.toMatch(/panic/i)
      },
      DEV_TIMEOUT,
    )

    it(
      'webpack: next build accepts them, and a pages/ route created later ships its atom on the next build',
      async () => {
        const app = createNextApp()
        apps.push(app)
        const cold = await app.next(['build', '--webpack'])
        expect(cold.code, cold.output).toBe(0)
        expect(Object.keys(app.record()?.directories ?? {})).toEqual(expect.arrayContaining(ABSENT))
        app.write(LATER_ROUTE)
        const warm = await app.next(['build', '--webpack'])
        expect(warm.code, warm.output).toBe(0)
        expect(app.record()?.atoms ?? []).toContain('grid')
        expect(app.builtCss()).toContain('.nave-grid')
      },
      BUILD_TIMEOUT,
    )
  },
)
