/**
 * AC-nextjs-used-atoms-27 and AC-nextjs-used-atoms-23 on a real build: a call the build cannot read
 * stops `next build` from the hook with the report printed once and one short line after it, the
 * config's own hook runs first, and a green app prints nothing of the package's.
 */
import { REPORT_CAUSE } from '@navecss/core/collect'
import { afterEach, describe, expect, it } from 'vitest'

import type { NextApp } from '../helpers/next-app.ts'

import { createNextApp, SKIP_REASON } from '../helpers/next-app.ts'

const TIMEOUT = 900_000
const FIRST_LINE = `1 problem in 1 file: ${REPORT_CAUSE}`
const STOP_LINE = 'Nave stopped the build: 1 problem, listed above.'

const apps: NextApp[] = []
afterEach(async () => {
  for (const app of apps) await app.remove()
  apps.length = 0
})

const BAD_PAGE = [
  "import { cx } from '@navecss/core/cx'",
  '',
  'export default function Page({ variant }) {',
  '  return <div id="t" className={cx(variant)} />',
  '}',
  '',
].join('\n')

const BUNDLERS: [string, string[]][] = [
  ['Turbopack', []],
  ['webpack', ['--webpack']],
]

/**
 * The builds the check runs in: each bundler, and with `--debug-prerender`, which sets `NODE_ENV`
 * to `development` for the build.
 */
const BUILDS: [string, string[]][] = [
  ...BUNDLERS,
  ['Turbopack with --debug-prerender', ['--debug-prerender']],
  ['webpack with --debug-prerender', ['--webpack', '--debug-prerender']],
]

/**
 * What the development server's report ends with: a build never prints it.
 */
const DEV_CLOSING = 'The dev server keeps serving'

/**
 * How many times `text` occurs in `output`.
 */
function occurrences(output: string, text: string): number {
  return output.split(text).length - 1
}

describe.skipIf(SKIP_REASON !== undefined)(
  `the build hook on a real next build${SKIP_REASON === undefined ? '' : ` (skipped: ${SKIP_REASON})`}`,
  () => {
    it.each(BUILDS)(
      'AC-nextjs-used-atoms-27: %s: a call it cannot read fails the build, the report once, then one short line',
      async (_bundler, flags) => {
        const app = createNextApp()
        apps.push(app)
        app.write({ 'app/page.jsx': BAD_PAGE })
        const run = await app.next(['build', ...flags])
        expect(run.code, run.output).not.toBe(0)
        expect(occurrences(run.output, FIRST_LINE)).toBe(1)
        expect(run.output).not.toContain(DEV_CLOSING)
        expect(run.output).toMatch(/^app\/page\.jsx:4:/mu)
        expect(run.output).toContain(STOP_LINE)
        expect(run.output.indexOf(FIRST_LINE)).toBeLessThan(run.output.indexOf(STOP_LINE))
        expect(run.output).toContain('withNave()')
        expect(run.output).not.toContain('navePlugin()')
      },
      TIMEOUT,
    )

    it.each(BUNDLERS)(
      'AC-nextjs-used-atoms-03: %s: an @nave problem is counted beside a call it cannot read, at its stylesheet position',
      async (_bundler, flags) => {
        const app = createNextApp()
        apps.push(app)
        app.write({
          'app/page.jsx': BAD_PAGE,
          'app/globals.css':
            "@import url('@navecss/core/layers');\n@import url('@navecss/core');\n\n.card {\n  @nave interactve;\n}\n",
        })
        const run = await app.next(['build', ...flags])
        expect(run.code, run.output).not.toBe(0)
        expect(run.output).toContain(`2 problems in 2 files: ${REPORT_CAUSE}`)
        expect(run.output).toMatch(/^app\/globals\.css:5:3: @nave: unknown atom "interactve"/mu)
        expect(run.output).toMatch(/^app\/page\.jsx:4:/mu)
        expect(run.output).toContain('Nave stopped the build: 2 problems, listed above.')
      },
      TIMEOUT,
    )

    it.each(BUNDLERS)(
      'AC-nextjs-used-atoms-27: %s: a build that reads every call prints nothing of the package and exits 0',
      async (_bundler, flags) => {
        const app = createNextApp()
        apps.push(app)
        const run = await app.next(['build', ...flags])
        expect(run.code, run.output).toBe(0)
        expect(run.output).not.toContain(REPORT_CAUSE)
        expect(run.output).not.toContain('Nave stopped')
        expect(app.builtCss()).toContain('.nave-flex')
      },
      TIMEOUT,
    )

    it.each(BUNDLERS)(
      "AC-nextjs-used-atoms-23: %s: the config's own hook runs before the check, and its failure stops the check",
      async (_bundler, flags) => {
        const app = createNextApp(
          [
            "import { withNave } from '@navecss/prune'",
            '',
            'export default withNave({',
            '  compiler: {',
            '    runAfterProductionCompile: async () => {',
            "      console.error('PROBE HOOK RAN')",
            '    },',
            '  },',
            '})',
            '',
          ].join('\n'),
        )
        apps.push(app)
        app.write({ 'app/page.jsx': BAD_PAGE })
        const run = await app.next(['build', ...flags])
        expect(run.code, run.output).not.toBe(0)
        expect(occurrences(run.output, 'PROBE HOOK RAN')).toBe(1)
        expect(run.output.indexOf('PROBE HOOK RAN')).toBeLessThan(run.output.indexOf(FIRST_LINE))
      },
      TIMEOUT,
    )
  },
)
