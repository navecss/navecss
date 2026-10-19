/**
 * `next build apps/web` and `next dev apps/web`, run from a repository's top, on both bundlers:
 * the plugin reads `apps/web` as the project, writes its record under `apps/web/.next/cache`, and
 * ships the atoms the app's code uses. Next.js loads `next.config` with the top as the working
 * directory, so the wrapper alone cannot tell the plugin where the project is.
 */
import { afterEach, describe, expect, it } from 'vitest'

import type { NextApp } from '../helpers/next-app.ts'

import { createNextApp, SKIP_REASON } from '../helpers/next-app.ts'

const TIMEOUT = 600_000

const apps: NextApp[] = []
afterEach(async () => {
  for (const app of apps) await app.remove()
  apps.length = 0
})

/**
 * A new app, removed after the test.
 */
function newApp(): NextApp {
  const app = createNextApp()
  apps.push(app)
  return app
}

describe.skipIf(SKIP_REASON !== undefined)(
  `next build and next dev given the project directory from the repository top${SKIP_REASON === undefined ? '' : ` (skipped: ${SKIP_REASON})`}`,
  () => {
    it.each([
      ['Turbopack', []],
      ['webpack', ['--webpack']],
    ])(
      '%s: next build apps/web records under apps/web and ships the page atom',
      async (_bundler, flags) => {
        const app = newApp()
        const run = await app.next(['build', ...flags, 'apps/web'], app.top)
        expect(run.code, run.output).toBe(0)
        expect(app.record()?.atoms ?? []).toContain('flex')
        expect(app.record(app.top)).toBeUndefined()
        expect(app.builtCss()).toContain('.nave-flex')
      },
      TIMEOUT,
    )

    it.each([
      ['Turbopack', []],
      ['webpack', ['--webpack']],
    ])(
      '%s: next dev apps/web records under apps/web and serves the page atom',
      async (_bundler, flags) => {
        const app = newApp()
        const server = await app.dev([...flags, 'apps/web'], app.top)
        expect(await server.css('/')).toContain('.nave-flex')
        await server.stop()
        expect(app.record()?.atoms ?? []).toContain('flex')
        expect(app.record(app.top)).toBeUndefined()
      },
      TIMEOUT,
    )
  },
)
