/**
 * AC-nextjs-used-atoms-31 and AC-nextjs-used-atoms-32 on a real build: a warm build after a change
 * to the code or the options ships the new set, a warm build after a change the plugin did not
 * read stays green, and an edit the record cannot account for fails from the hook.
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

const PAGE = (atoms: string): string =>
  [
    "import { cx } from '@navecss/core/cx'",
    '',
    'export default function Page() {',
    `  return <div id="t" className={cx(${atoms})} />`,
    '}',
    '',
  ].join('\n')

const config = (keep: string): string =>
  `import { withNave } from '@navecss/prune'\n\nexport default withNave({}, { keep: ['${keep}'] })\n`

const BUNDLERS: [string, string[]][] = [
  ['Turbopack', []],
  ['webpack', ['--webpack']],
]

describe.skipIf(SKIP_REASON !== undefined)(
  `warm builds with the hook${SKIP_REASON === undefined ? '' : ` (skipped: ${SKIP_REASON})`}`,
  () => {
    it.each(BUNDLERS)(
      '%s: AC-nextjs-used-atoms-31: a call added to the page ships its atom on the warm build',
      async (_bundler, flags) => {
        const app = createNextApp()
        apps.push(app)
        const cold = await app.next(['build', ...flags])
        expect(cold.code, cold.output).toBe(0)
        expect(app.builtCss()).not.toContain('.nave-grid')
        app.write({ 'app/page.jsx': PAGE("'flex', 'grid'") })
        const warm = await app.next(['build', ...flags])
        expect(warm.code, warm.output).toBe(0)
        expect(app.builtCss()).toContain('.nave-grid')
      },
      TIMEOUT,
    )

    it.each(BUNDLERS)(
      '%s: AC-nextjs-used-atoms-32: a warm build after a change the plugin did not read stays green',
      async (_bundler, flags) => {
        const app = createNextApp()
        apps.push(app)
        const cold = await app.next(['build', ...flags])
        expect(cold.code, cold.output).toBe(0)
        app.write({ 'README.md': 'notes\n', 'public/robots.txt': 'User-agent: *\n' })
        const warm = await app.next(['build', ...flags])
        expect(warm.code, warm.output).toBe(0)
        expect(warm.output).not.toContain('Nave stopped')
        expect(app.builtCss()).toContain('.nave-flex')
      },
      TIMEOUT,
    )

    it.each(BUNDLERS)(
      '%s: AC-nextjs-used-atoms-06: new options on the warm build ship the new set',
      async (_bundler, flags) => {
        const app = createNextApp(config('grid'))
        apps.push(app)
        const cold = await app.next(['build', ...flags])
        expect(cold.code, cold.output).toBe(0)
        expect(app.builtCss()).toContain('.nave-grid')
        app.write({ 'next.config.mjs': config('block') })
        const warm = await app.next(['build', ...flags])
        expect(warm.code, warm.output).toBe(0)
        expect(app.builtCss()).toContain('.nave-block')
        expect(app.builtCss()).not.toContain('.nave-grid')
      },
      TIMEOUT,
    )
  },
)
