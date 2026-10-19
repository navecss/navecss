/**
 * A monorepo on a real build, both bundlers, run from the repository's top (`next build apps/web`)
 * and from `apps/web`: the app ships the atom a workspace package's `cx()` call names, the
 * plugin declares that package's module, and a warm build after an edit to it ships the new atom.
 * The workspace package lies outside the app's directory and inside the root Next.js infers.
 */
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import type { MonorepoApp } from '../helpers/next-monorepo.ts'

import { SKIP_REASON } from '../helpers/next-app.ts'
import { createMonorepoApp } from '../helpers/next-monorepo.ts'

const TIMEOUT = 900_000

const apps: MonorepoApp[] = []
afterEach(async () => {
  for (const app of apps) await app.remove()
  apps.length = 0
})

describe.skipIf(SKIP_REASON !== undefined)(
  `a workspace package the app imports, on a real build${SKIP_REASON === undefined ? '' : ` (skipped: ${SKIP_REASON})`}`,
  () => {
    it.each([
      ['Turbopack', 'the top', [], true],
      ['Turbopack', 'apps/web', [], false],
      ['webpack', 'the top', ['--webpack'], true],
      ['webpack', 'apps/web', ['--webpack'], false],
    ])(
      '%s, run from %s: an edit to the package ships its new atom on the next build',
      async (_bundler, _from, flags, isFromTop) => {
        const app = createMonorepoApp()
        apps.push(app)
        const args = isFromTop ? ['build', ...flags, 'apps/web'] : ['build', ...flags]
        const cwd = isFromTop ? app.top : app.dir
        const cold = await app.next(args, cwd)
        expect(cold.code, cold.output).toBe(0)
        expect(app.builtCss()).toContain('.nave-grid')
        const module = path.relative(app.dir, app.uiModule)
        expect(Object.keys(app.record()?.files ?? {})).toContain(module)
        app.lookAt('flex')
        const warm = await app.next(args, cwd)
        expect(warm.code, warm.output).toBe(0)
        expect(warm.output).not.toMatch(/panic|leaves the filesystem root/i)
        expect(app.record()?.atoms ?? []).toContain('flex')
        expect(app.builtCss()).toContain('.nave-flex')
      },
      TIMEOUT,
    )
  },
)
