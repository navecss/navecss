/**
 * AC-nextjs-used-atoms-25 and AC-nextjs-used-atoms-26 on a real build: the wrapper without the
 * plugin and both plugins listed stop `next build` from the hook, each naming the entry to change,
 * and a wrapper with no Nave stylesheet anywhere has nothing to check.
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

const ENTRY = "'@navecss/prune/postcss': {}"
const CORE = "'@navecss/core/postcss': {}"

/**
 * A new app, with the PostCSS config's plugins as `plugins`.
 */
function appWithPlugins(plugins: string): NextApp {
  const app = createNextApp()
  apps.push(app)
  app.write({ 'postcss.config.mjs': `export default { plugins: { ${plugins} } }\n` })
  return app
}

const BUNDLERS: [string, string[]][] = [
  ['Turbopack', []],
  ['webpack', ['--webpack']],
]

describe.skipIf(SKIP_REASON !== undefined)(
  `the wrapper and the plugin on a real next build${SKIP_REASON === undefined ? '' : ` (skipped: ${SKIP_REASON})`}`,
  () => {
    it.each(BUNDLERS)(
      'AC-nextjs-used-atoms-25: %s: no Nave entry in the PostCSS config fails the build, naming the entry to add',
      async (_bundler, flags) => {
        const app = appWithPlugins('')
        const run = await app.next(['build', ...flags])
        expect(run.code, run.output).not.toBe(0)
        expect(run.output).toContain(ENTRY)
        expect(run.output).toContain('Nave stopped the build: 1 problem, listed above.')
      },
      TIMEOUT,
    )

    it(
      "AC-nextjs-used-atoms-25: Turbopack: core's entry in place of the package's fails the same way",
      async () => {
        const app = appWithPlugins(CORE)
        const run = await app.next(['build'])
        expect(run.code, run.output).not.toBe(0)
        expect(run.output).toContain(ENTRY)
      },
      TIMEOUT,
    )

    it(
      'AC-nextjs-used-atoms-25: Turbopack: with no Nave stylesheet imported anywhere the build is green',
      async () => {
        const app = appWithPlugins('')
        app.write({
          'app/layout.jsx': [
            'export default function RootLayout({ children }) {',
            '  return (',
            '    <html lang="en">',
            '      <body>{children}</body>',
            '    </html>',
            '  )',
            '}',
            '',
          ].join('\n'),
        })
        const run = await app.next(['build'])
        expect(run.code, run.output).toBe(0)
        expect(run.output).not.toContain('Nave stopped')
      },
      TIMEOUT,
    )

    it.each(BUNDLERS)(
      "AC-nextjs-used-atoms-26: %s: both plugins listed fail the build, naming core's entry once",
      async (_bundler, flags) => {
        const app = appWithPlugins(`${CORE}, ${ENTRY}`)
        const run = await app.next(['build', ...flags])
        expect(run.code, run.output).not.toBe(0)
        expect(run.output.split("Remove '@navecss/core/postcss'").length - 1).toBe(1)
      },
      TIMEOUT,
    )
  },
)
