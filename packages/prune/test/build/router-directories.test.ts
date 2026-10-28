/**
 * The plugin declares the router directories Next.js reads (`app/`, `pages/`, and both under
 * `src/`) whether or not they exist yet. Both bundlers accept a declaration of a directory that
 * does not exist, and a route created in one later is read: on Turbopack's dev server that
 * declaration is what runs the plugin again.
 */
import { afterEach, describe, expect, it } from 'vitest'

import type { NextApp } from '../helpers/next-app.ts'

import { RETRY_ON_ROUTE_NOT_BUILT, untilLaterRouteGrid } from '../helpers/later-route.ts'
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

/**
 * Creates the route's directory again. On a busy machine the dev server sometimes misses the event
 * of the directory's creation (5 of 60 measured runs). Writing the same text again heals most of
 * those, not all: one run took four writes. Removing the directory and writing the route once more
 * repeats the creation itself, and healed both runs that needed it on its first try.
 */
function recreateLaterRoute(app: NextApp): void {
  app.delete('pages')
  app.write(LATER_ROUTE)
}

describe.skipIf(SKIP_REASON !== undefined)(
  `router directories that do not exist yet${SKIP_REASON === undefined ? '' : ` (skipped: ${SKIP_REASON})`}`,
  () => {
    // The dev server never builds the route in about 1 run in 50 under heavy load: the row ran
    // 52 times with the plugin and 52 times with core's plugin alone (every atom, no pruning),
    // with 9 to 25 busy loops on a 10-core machine and a load average of 170 to 350, and one run
    // with the plugin, none without, ended with `/later` answering 404 and no recompile printed. No
    // run served the route without its atom. A run that ends that way runs once more, from a fresh
    // app; any other red fails at once.
    it(
      'Turbopack: next dev accepts them, and a pages/ route created later ships its atom',
      { retry: RETRY_ON_ROUTE_NOT_BUILT, timeout: DEV_TIMEOUT },
      async () => {
        const app = createNextApp()
        apps.push(app)
        const server = await app.dev([])
        expect(await server.css('/')).toContain('.nave-flex')
        expect(Object.keys(app.record()?.directories ?? {})).toEqual(expect.arrayContaining(ABSENT))
        app.write(LATER_ROUTE)
        await untilLaterRouteGrid(server, () => recreateLaterRoute(app))
        await server.stop()
        expect(server.output()).not.toMatch(/panic/i)
      },
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
